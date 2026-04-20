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
import relayRoutes from './routes/relay.js';
import analyticsRoutes from './routes/analytics.js';
import { ClaudeProcess } from './services/claudeProcess.js';
import { startSession as startChatSession, sendMessage as sendChatMessage, stopSession as stopChatSession, stopAllChatSessions } from './services/agentChat.js';
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
import { stopRelay } from './services/relayConnector.js';
import { createMessage } from './services/messageStorage.js';
import { track, hashId } from './services/analytics.js';

const app = express();
const PORT = parseInt(process.env.PORT || '7433', 10);
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
app.use('/api/relay', relayRoutes);
app.use('/api/analytics', analyticsRoutes);

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
  let activeSessionId: string | null = null;
  let messageStartTime: number | null = null;

  // Tracking state for delta computation from SDK streaming events
  let lastTextLength = 0;
  let lastThinkingLength = 0;
  let lastMessageId = '';
  const sentToolUseIds = new Set<string>();

  const safeSend = (data: object) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  };

  const resetTracking = () => {
    lastTextLength = 0;
    lastThinkingLength = 0;
    lastMessageId = '';
    sentToolUseIds.clear();
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
        // Stop previous session if any
        if (activeSessionId) {
          stopChatSession(activeSessionId);
        }

        activeSessionId = msg.sessionId;
        resetTracking();
        track('ws_chat_resume', { session_hash: hashId(msg.sessionId || '') });

        startChatSession(msg.sessionId, msg.projectPath, (_sessionId, event) => {
          // Map SDK events to the WebSocket protocol the iOS client expects
          switch (event.type) {
            case 'system': {
              if ((event as any).subtype === 'init') {
                console.log('[ws] Claude SDK init received');
              }
              break;
            }

            case 'stream_event': {
              // SDKPartialAssistantMessage — streaming deltas
              const streamEvent = (event as any).event;
              if (!streamEvent) break;

              // Handle content_block_delta for text streaming
              if (streamEvent.type === 'content_block_delta') {
                const delta = streamEvent.delta;
                if (delta?.type === 'text_delta' && delta.text) {
                  safeSend({ type: 'assistant_text', text: delta.text });
                } else if (delta?.type === 'thinking_delta' && delta.thinking) {
                  safeSend({ type: 'assistant_thinking', text: delta.thinking });
                }
              }
              break;
            }

            case 'assistant': {
              // SDKAssistantMessage — full message snapshot
              const betaMsg = (event as any).message;
              if (!betaMsg?.content) break;

              const messageId = betaMsg.id || '';
              if (messageId !== lastMessageId) {
                lastMessageId = messageId;
                lastTextLength = 0;
                lastThinkingLength = 0;
              }

              let fullText = '';
              let fullThinking = '';

              for (const block of betaMsg.content) {
                if (block.type === 'text' && block.text) {
                  fullText += block.text;
                } else if (block.type === 'thinking' && block.thinking) {
                  fullThinking += block.thinking;
                } else if (block.type === 'tool_use' && !sentToolUseIds.has(block.id)) {
                  sentToolUseIds.add(block.id);
                  safeSend({
                    type: 'tool_use',
                    name: block.name,
                    id: block.id,
                    input: block.input || {},
                  });
                }
              }

              if (fullThinking.length > lastThinkingLength) {
                const delta = fullThinking.slice(lastThinkingLength);
                lastThinkingLength = fullThinking.length;
                safeSend({ type: 'assistant_thinking', text: delta });
              }

              if (fullText.length > lastTextLength) {
                const delta = fullText.slice(lastTextLength);
                lastTextLength = fullText.length;
                safeSend({ type: 'assistant_text', text: delta });
              }
              break;
            }

            case 'result': {
              const durationMs = messageStartTime ? Date.now() - messageStartTime : null;
              messageStartTime = null;
              track('ws_chat_response', { duration_ms: durationMs });

              // If result has text and we haven't sent any yet, send it
              const resultText = (event as any).result;
              if (resultText && typeof resultText === 'string' && lastTextLength === 0) {
                safeSend({ type: 'assistant_text', text: resultText });
              }

              safeSend({ type: 'done' });
              resetTracking();
              break;
            }

            default:
              break;
          }
        });

        // Send connected immediately
        safeSend({ type: 'connected', sessionId: msg.sessionId });
        break;
      }

      case 'message': {
        if (!activeSessionId) {
          safeSend({ type: 'error', message: 'No active session. Send "resume" first.' });
          return;
        }
        track('ws_chat_message', { char_count: (msg.content || '').length });
        messageStartTime = Date.now();
        resetTracking();
        const sent = sendChatMessage(activeSessionId, msg.content);
        if (!sent) {
          safeSend({ type: 'error', message: 'Failed to send message — session may have ended.' });
        }
        break;
      }

      case 'stop': {
        if (activeSessionId) {
          stopChatSession(activeSessionId);
          activeSessionId = null;
        }
        break;
      }
    }
  });

  ws.on('close', (code: number, reason: Buffer) => {
    console.log(`[ws] Client disconnected code=${code} reason=${reason.toString()}`);
    if (activeSessionId) {
      stopChatSession(activeSessionId);
      activeSessionId = null;
    }
  });

  ws.on('error', (err: Error) => {
    console.error(`[ws] Client error: ${err.message}`);
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
  console.log(`
  \x1b[38;5;208m██████╗\x1b[0m\x1b[38;5;214m██╗\x1b[0m      \x1b[38;5;220m█████╗\x1b[0m \x1b[38;5;226m██╗   ██╗\x1b[0m\x1b[38;5;190m██████╗\x1b[0m \x1b[38;5;154m██╗\x1b[0m\x1b[38;5;118m████████╗\x1b[0m
  \x1b[38;5;208m██╔════╝\x1b[0m\x1b[38;5;214m██║\x1b[0m     \x1b[38;5;220m██╔══██╗\x1b[0m\x1b[38;5;226m██║   ██║\x1b[0m\x1b[38;5;190m██╔══██╗\x1b[0m\x1b[38;5;154m██║\x1b[0m\x1b[38;5;118m╚══██╔══╝\x1b[0m
  \x1b[38;5;208m██║\x1b[0m     \x1b[38;5;214m██║\x1b[0m     \x1b[38;5;220m███████║\x1b[0m\x1b[38;5;226m██║   ██║\x1b[0m\x1b[38;5;190m██║  ██║\x1b[0m\x1b[38;5;154m██║\x1b[0m\x1b[38;5;118m   ██║\x1b[0m
  \x1b[38;5;208m██║\x1b[0m     \x1b[38;5;214m██║\x1b[0m     \x1b[38;5;220m██╔══██║\x1b[0m\x1b[38;5;226m██║   ██║\x1b[0m\x1b[38;5;190m██║  ██║\x1b[0m\x1b[38;5;154m██║\x1b[0m\x1b[38;5;118m   ██║\x1b[0m
  \x1b[38;5;208m╚██████╗\x1b[0m\x1b[38;5;214m███████╗\x1b[0m\x1b[38;5;220m██║  ██║\x1b[0m\x1b[38;5;226m╚██████╔╝\x1b[0m\x1b[38;5;190m██████╔╝\x1b[0m\x1b[38;5;154m██║\x1b[0m\x1b[38;5;118m   ██║\x1b[0m
  \x1b[38;5;208m ╚═════╝\x1b[0m\x1b[38;5;214m╚══════╝\x1b[0m\x1b[38;5;220m╚═╝  ╚═╝\x1b[0m\x1b[38;5;226m ╚═════╝\x1b[0m \x1b[38;5;190m╚═════╝\x1b[0m \x1b[38;5;154m╚═╝\x1b[0m\x1b[38;5;118m   ╚═╝\x1b[0m

  \x1b[2mThe simplest Claude Code orchestrator\x1b[0m
  \x1b[36m→\x1b[0m http://localhost:${PORT}
`);
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
      stopRelay();
      stopAllChatSessions();
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
