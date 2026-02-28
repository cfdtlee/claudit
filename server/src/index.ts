import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import sessionRoutes from './routes/sessions.js';
import cronRoutes from './routes/cron.js';
import todoRoutes from './routes/todo.js';
import groupRoutes from './routes/groups.js';
import todoProviderRoutes from './routes/todoProviders.js';
import filesystemRoutes from './routes/filesystem.js';
import { ClaudeProcess } from './services/claudeProcess.js';
import { initScheduler, stopAllJobs } from './services/cronScheduler.js';
import { initProviderSync, stopProviderSync } from './services/todoSyncEngine.js';
import { closeMcpConnections } from './services/providers/mcpClient.js';
let handleTerminalConnection: ((ws: import('ws').WebSocket) => void) | null = null;
try {
  const ptyMod = await import('./services/ptyManager.js');
  handleTerminalConnection = ptyMod.handleTerminalConnection;
} catch {
  console.warn('[server] ptyManager not available — terminal feature disabled.');
}
import { eventBus } from './services/eventBus.js';
import { closeDb } from './services/database.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const CLAUDIT_ROOT = process.env.CLAUDIT_ROOT;

app.use(cors());
app.use(express.json());

// REST routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/todo/providers', todoProviderRoutes);
app.use('/api/todo/groups', groupRoutes);
app.use('/api/todo', todoRoutes);
app.use('/api/filesystem', filesystemRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Production mode: serve client static files
if (CLAUDIT_ROOT) {
  const clientDist = path.join(CLAUDIT_ROOT, 'client', 'dist');
  app.use(express.static(clientDist));
  // SPA fallback: non-API/WS requests return index.html
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = createServer(app);

// WebSocket servers (noServer mode to avoid multiple upgrade handler conflicts)
const wss = new WebSocketServer({ noServer: true });
const wssTerminal = new WebSocketServer({ noServer: true });
const wssEvents = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url || '', `http://${request.headers.host}`);

  if (pathname === '/ws/chat') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/ws/terminal') {
    wssTerminal.handleUpgrade(request, socket, head, (ws) => {
      wssTerminal.emit('connection', ws, request);
    });
  } else if (pathname === '/ws/events') {
    wssEvents.handleUpgrade(request, socket, head, (ws) => {
      wssEvents.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wssTerminal.on('connection', (ws: WebSocket) => {
  if (handleTerminalConnection) {
    handleTerminalConnection(ws);
  } else {
    ws.send('\x00' + JSON.stringify({ type: 'error', message: 'Terminal not available: node-pty is not installed. Run: npm install node-pty' }));
    ws.close();
  }
});

wssEvents.on('connection', (ws: WebSocket) => {
  const unsubscribe = eventBus.onSessionEvent((event) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  });
  ws.on('close', () => unsubscribe());
});

wss.on('connection', (ws: WebSocket) => {
  console.log('[ws] Client connected');
  let claude: ClaudeProcess | null = null;

  const safeSend = (data: object) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  ws.on('message', (raw: Buffer) => {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      safeSend({ type: 'error', message: 'Invalid JSON' });
      return;
    }

    console.log(`[ws] Received: ${msg.type}`);

    switch (msg.type) {
      case 'resume': {
        if (claude) claude.stop();

        claude = new ClaudeProcess(msg.sessionId, msg.projectPath);

        claude.on('ready', () => {
          console.log('[ws] Claude CLI ready');
        });

        claude.on('assistant_text', (text: string) => {
          safeSend({ type: 'assistant_text', text });
        });

        claude.on('assistant_thinking', (text: string) => {
          safeSend({ type: 'assistant_thinking', text });
        });

        claude.on('tool_use', (data: any) => {
          safeSend({ type: 'tool_use', ...data });
        });

        claude.on('tool_result', (data: any) => {
          safeSend({ type: 'tool_result', ...data });
        });

        claude.on('done', () => {
          safeSend({ type: 'done' });
        });

        claude.on('error', (message: string) => {
          safeSend({ type: 'error', message });
        });

        claude.start();
        // Send connected immediately — CLI waits for stdin so no init event until message sent
        safeSend({ type: 'connected', sessionId: msg.sessionId });
        break;
      }

      case 'message': {
        if (!claude) {
          safeSend({ type: 'error', message: 'No active session. Send "resume" first.' });
          return;
        }
        claude.sendMessage(msg.content);
        break;
      }

      case 'stop': {
        if (claude) {
          claude.stop();
          claude = null;
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log('[ws] Client disconnected');
    if (claude) {
      claude.stop();
      claude = null;
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  initScheduler();
  initProviderSync();
});

// Graceful shutdown for tsx watch restarts
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    stopAllJobs();
    stopProviderSync();
    closeMcpConnections();
    closeDb();
    server.close();
    process.exit(0);
  });
}
