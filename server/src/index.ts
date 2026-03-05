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
import { ensureMayorRunning, stopMayor, sendToMayor, isMayorEnabled } from './services/mayorService.js';
import { updateTask, getTask, getAllTasks } from './services/taskStorage.js';
import { getAgent } from './services/agentStorage.js';
import { getSetting, getSettingsObject } from './services/settingsStorage.js';
import { spawnAgentSession, killAgentSession, sendToAgent, stopAllAgentSessions } from './services/sessionManager.js';
import { createMessage } from './services/messageStorage.js';

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

// Internal API for MCP tools (same-machine HTTP calls instead of DB polling)
app.post('/api/internal/spawn', async (req, res) => {
  const { taskId, agentId } = req.body;
  if (!taskId || !agentId) return res.status(400).json({ error: 'taskId and agentId required' });
  try {
    const task = getTask(taskId);
    const agent = getAgent(agentId);
    broadcastEvent({ type: 'notification', level: 'info', title: `${agent?.name ?? 'Agent'} spawning…`, message: `"${task?.title ?? taskId}"` });
    const { sessionId } = await spawnAgentSession(taskId, agentId);
    res.json({ sessionId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/internal/kill', (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });
  const ok = killAgentSession(sessionId);
  res.json({ ok });
});

app.post('/api/internal/send', (req, res) => {
  const { agentId, message } = req.body;
  if (!agentId || !message) return res.status(400).json({ error: 'agentId and message required' });
  const ok = sendToAgent(agentId, message);
  res.json({ ok });
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

// Broadcast to all connected /ws/events clients
function broadcastEvent(event: object) {
  const msg = JSON.stringify(event);
  for (const client of wssEvents.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  initScheduler();
  startWitness();

  // Mayor is disabled by default — user must start it manually from the dashboard

  // Listen for witness events — only restart Mayor if enabled
  witnessEmitter.on('mayorCheck', async (_sessionId: string) => {
    if (!isMayorEnabled()) return;
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

    // 3. Notify Mayor that a task is unblocked
    const unblockedMsg = `Task ${taskId} is now unblocked. Use get_tasks() to review and assign/spawn it.`;
    createMessage({
      type: 'event',
      source: 'witness',
      subject: `Task unblocked: ${taskId}`,
      body: unblockedMsg,
    });
    sendToMayor(unblockedMsg).catch(err => {
      console.error('[witness] Failed to notify Mayor:', err);
    });
  });

  // Forward claudit events to WebSocket clients
  eventBus.onEvent((event) => {
    broadcastEvent(event);
  });

  // Mayor Patrol: periodically check for pending tasks and notify Mayor
  const PATROL_INTERVAL = getSettingsObject().patrolIntervalMs ?? 300000;
  let patrolTimer = setInterval(() => {
    try {
      const pendingTasks = getAllTasks().filter(t => t.status === 'pending');
      if (pendingTasks.length === 0) return;

      const summary = pendingTasks.map(t =>
        `- ${t.id} "${t.title}" assignee=${t.assignee ?? 'unassigned'}`
      ).join('\n');

      const patrolMsg = `Patrol check: ${pendingTasks.length} pending task(s) found.\n${summary}\n\nFollow your Patrol Response Procedure: get_tasks(status="pending") → get_agents() → match → spawn.`;
      createMessage({
        type: 'event',
        source: 'patrol',
        subject: 'patrol',
        body: patrolMsg,
      });
      sendToMayor(patrolMsg).catch(err => {
        console.error('[patrol] Failed to notify Mayor:', err);
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
