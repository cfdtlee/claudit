import express from 'express';
import cors from 'cors';
import path from 'path';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import sessionRoutes from './routes/sessions.js';
import cronRoutes from './routes/cron.js';
import filesystemRoutes from './routes/filesystem.js';
import agentRoutes from './routes/agents.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import settingsRoutes from './routes/settings.js';
import dashboardRoutes from './routes/dashboard.js';
import groupRoutes from './routes/groups.js';
import { ClaudeProcess } from './services/claudeProcess.js';
import { initScheduler, stopAllJobs } from './services/cronScheduler.js';
let handleTerminalConnection: ((ws: import('ws').WebSocket) => void) | null = null;
try {
  const ptyMod = await import('./services/ptyManager.js');
  handleTerminalConnection = ptyMod.handleTerminalConnection;
} catch {
  console.warn('[server] ptyManager not available — terminal feature disabled.');
}
import { eventBus } from './services/eventBus.js';
import { closeDb } from './services/database.js';
import { startWitness, stopWitness, witnessEmitter } from './services/witnessService.js';
import { ensureMayorRunning, stopMayor } from './services/mayorService.js';
import { updateTask, getTask, getAllTasks } from './services/taskStorage.js';
import { getAgent } from './services/agentStorage.js';
import { getSetting } from './services/settingsStorage.js';
import { spawnAgentSession, killAgentSession, sendToAgent, stopAllAgentSessions } from './services/sessionManager.js';
import { getAllMessages, markMessageRead, createMessage } from './services/messageStorage.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const CLAUDIT_ROOT = process.env.CLAUDIT_ROOT;

app.use(cors());
app.use(express.json());

// REST routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/filesystem', filesystemRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/groups', groupRoutes);

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
  startWitness();

  // Auto-start Mayor on server boot (non-blocking)
  ensureMayorRunning().then(() => {
    broadcastEvent({ type: 'notification', level: 'info', title: 'Mayor', message: 'Mayor is online and ready' });
  }).catch(err => {
    console.error('[server] Failed to auto-start mayor:', err);
  });

  // Broadcast to all connected /ws/events clients
  function broadcastEvent(event: object) {
    const msg = JSON.stringify(event);
    for (const client of wssEvents.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  // Listen for witness events
  witnessEmitter.on('mayorCheck', async (_sessionId: string) => {
    try {
      await ensureMayorRunning();
    } catch (err) {
      console.error('[server] Failed to ensure mayor running:', err);
    }
  });

  witnessEmitter.on('sessionStuck', (data: any) => {
    const elapsedMin = Math.round(data.elapsed / 60000);
    console.warn(`[witness] Session stuck: task=${data.taskId} elapsed=${elapsedMin}m`);

    // 1. Update task status to 'waiting' with error message
    updateTask(data.taskId, {
      status: 'waiting',
      errorMessage: `Session stuck for ${elapsedMin} minutes`,
    });

    // 2. Notify Mayor via DB mailbox
    createMessage({
      type: 'event',
      source: 'witness',
      subject: 'task_stuck',
      body: `Task ${data.taskId} session stuck for ${elapsedMin} minutes. Decide: retry, reassign, or escalate.`,
    });

    // 3. Broadcast to frontend
    broadcastEvent({ type: 'task_updated', taskId: data.taskId });
    broadcastEvent({ type: 'notification', level: 'warning', title: 'Session stuck', message: `Task stuck for ${elapsedMin}m — needs attention` });
  });

  witnessEmitter.on('taskUnblocked', async (taskId: string) => {
    console.log(`[witness] Task unblocked: ${taskId}`);

    // 1. Ensure status is 'pending'
    updateTask(taskId, { status: 'pending' });

    // 2. Broadcast to frontend
    broadcastEvent({ type: 'task_updated', taskId });

    // 3. If mayorAutoExecute is enabled, notify Mayor via DB mailbox
    if (getSetting('mayorAutoExecute') === 'true') {
      createMessage({
        type: 'event',
        source: 'witness',
        subject: `Task unblocked: ${taskId}`,
        body: `Task ${taskId} is now unblocked. Check pending tasks and schedule execution.`,
      });
    }
  });

  // Forward claudit events to WebSocket clients
  eventBus.onEvent((event) => {
    broadcastEvent(event);
  });

  // Poll for Mayor spawn/kill/send requests from MCP tools
  setInterval(() => {
    try {
      const messages = getAllMessages({ type: 'event', unreadOnly: true });
      for (const msg of messages) {
        if (msg.source !== 'mayor') continue;

        if (msg.subject === 'spawn_request') {
          markMessageRead(msg.id);
          try {
            const { taskId, agentId } = JSON.parse(msg.body);
            const task = getTask(taskId);
            const agent = getAgent(agentId);
            spawnAgentSession(taskId, agentId).then(({ sessionId }) => {
              console.log(`[server] Spawned agent session: ${sessionId}`);
              broadcastEvent({ type: 'notification', level: 'info', title: `${agent?.name ?? 'Agent'} started`, message: `"${task?.title ?? taskId}"` });
            }).catch((err) => {
              console.error(`[server] Failed to spawn agent session:`, err);
              broadcastEvent({ type: 'notification', level: 'error', title: 'Agent spawn failed', message: `${err.message || 'Unknown error'}`, duration: 15000 });
            });
          } catch (err) {
            console.error('[server] Failed to parse spawn request:', err);
          }
        } else if (msg.subject === 'kill_request') {
          markMessageRead(msg.id);
          try {
            const { sessionId } = JSON.parse(msg.body);
            killAgentSession(sessionId);
          } catch (err) {
            console.error('[server] Failed to parse kill request:', err);
          }
        } else if (msg.subject === 'send_to_agent') {
          markMessageRead(msg.id);
          try {
            const { agentId, message } = JSON.parse(msg.body);
            sendToAgent(agentId, message);
          } catch (err) {
            console.error('[server] Failed to parse send_to_agent request:', err);
          }
        }
      }
    } catch (err) {
      // Silently ignore polling errors
    }
  }, 2000);

  // Mayor Patrol: periodically check for pending tasks and notify Mayor
  const PATROL_INTERVAL = parseInt(process.env.MAYOR_PATROL_INTERVAL_MS ?? '300000');
  const patrolTimer = setInterval(() => {
    try {
      const pendingTasks = getAllTasks().filter(t => t.status === 'pending');
      if (pendingTasks.length === 0) return;

      const summary = pendingTasks.map(t =>
        `- [${t.id.slice(0, 8)}] "${t.title}" assignee=${t.assignee ?? 'unassigned'}`
      ).join('\n');

      createMessage({
        type: 'event',
        source: 'patrol',
        subject: 'patrol',
        body: `Patrol check: ${pendingTasks.length} pending task(s) found.\n${summary}\n\nPlease use get_tasks() to review and assign/spawn them as needed.`,
      });

      console.log(`[patrol] Notified Mayor of ${pendingTasks.length} pending tasks`);
    } catch (err) {
      console.error('[patrol] Error:', err);
    }
  }, PATROL_INTERVAL);

  // Graceful shutdown for tsx watch restarts
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => {
      clearInterval(patrolTimer);
      stopAllAgentSessions();
      stopWitness();
      stopMayor();
      stopAllJobs();
      closeDb();
      server.close();
      process.exit(0);
    });
  }
});
