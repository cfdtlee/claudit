import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import { WebSocket } from 'ws';
import { eventBus } from './eventBus.js';
import { CLAUDE_BIN } from './claudeProcess.js';
import { track, hashId } from './analytics.js';

// node-pty is optional — dynamically loaded
let pty: typeof import('node-pty') | null = null;
try {
  pty = await import('node-pty');
} catch {
  console.warn('[pty] node-pty not available — terminal feature disabled. Install node-pty to enable it.');
}

// Track active PTY sessions for status reporting
const activePtySessions = new Set<string>();

export function getActivePtySessions(): ReadonlySet<string> {
  return activePtySessions;
}

console.log(`[pty] Claude binary: ${CLAUDE_BIN}`);

// Control message prefix — \x00 distinguishes control JSON from raw PTY data
const CTRL_PREFIX = '\x00';

function sendControl(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(CTRL_PREFIX + JSON.stringify(data));
  }
}

function sendData(ws: WebSocket, data: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}

// --- Persistent PTY cache keyed by sessionId ---

interface PtyEntry {
  process: import('node-pty').IPty;
  sessionId: string;
  scrollback: string[];       // recent output lines for replay on reattach
  attachedWs: WebSocket | null;
  exited: boolean;
  exitCode: number | null;
}

const MAX_SCROLLBACK = 50000;  // max chars to keep for replay
const PTY_IDLE_TIMEOUT = 10 * 60 * 1000; // kill orphan PTY after 10 min

const ptyCache = new Map<string, PtyEntry>();
const idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getPtyKey(sessionId: string, isNew: boolean): string {
  // For new sessions without a sessionId, generate a unique key
  return sessionId || `new-${Date.now()}`;
}

function startIdleTimer(key: string) {
  clearIdleTimer(key);
  idleTimers.set(key, setTimeout(() => {
    const entry = ptyCache.get(key);
    if (entry && !entry.attachedWs) {
      console.log(`[pty] Idle timeout, killing PTY: ${key}`);
      destroyPty(key);
    }
  }, PTY_IDLE_TIMEOUT));
}

function clearIdleTimer(key: string) {
  const timer = idleTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    idleTimers.delete(key);
  }
}

function destroyPty(key: string) {
  clearIdleTimer(key);
  const entry = ptyCache.get(key);
  if (entry) {
    if (!entry.exited) {
      try { entry.process.kill(); } catch {}
    }
    activePtySessions.delete(entry.sessionId);
    ptyCache.delete(key);
  }
}

function appendScrollback(entry: PtyEntry, data: string) {
  entry.scrollback.push(data);
  // Trim if too large
  let totalLen = 0;
  for (const s of entry.scrollback) totalLen += s.length;
  while (totalLen > MAX_SCROLLBACK && entry.scrollback.length > 1) {
    totalLen -= entry.scrollback.shift()!.length;
  }
}

const execFileAsync = promisify(execFile);

async function detectExternalClaude(sessionId: string): Promise<string | null> {
  if (!sessionId) return null;

  // If we have an active PTY for this session, the claude process is ours — skip
  for (const entry of ptyCache.values()) {
    if (entry.sessionId === sessionId && !entry.exited) {
      return null;
    }
  }

  // No active PTY from us — check if someone else is using this session (non-blocking)
  try {
    const { stdout } = await execFileAsync('pgrep', ['-af', `claude.*--resume.*${sessionId}`], {
      encoding: 'utf-8',
      timeout: 3000,
    });
    if (stdout.trim()) {
      return `Another claude process is already using session ${sessionId}. Memory changes will not be shared between processes.`;
    }
  } catch { /* pgrep returns exit code 1 when no match — ignore */ }
  return null;
}

/**
 * Kill any stale external Claude processes using this session.
 * This prevents session lock conflicts when resuming from the iOS app.
 */
async function killStaleClaudeProcesses(sessionId: string): Promise<void> {
  if (!sessionId) return;

  // Don't kill our own PTY processes
  const ourPids = new Set<number>();
  for (const entry of ptyCache.values()) {
    if (entry.sessionId === sessionId && !entry.exited) {
      ourPids.add(entry.process.pid);
    }
  }

  try {
    const { stdout } = await execFileAsync('pgrep', ['-f', `claude.*--resume.*${sessionId}`], {
      encoding: 'utf-8',
      timeout: 3000,
    });
    const pids = stdout.trim().split('\n').map(p => parseInt(p.trim())).filter(p => !isNaN(p) && !ourPids.has(p));
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`[pty] Killed stale claude process ${pid} for session ${sessionId}`);
      } catch { /* already dead */ }
    }
    if (pids.length > 0) {
      // Wait briefly for processes to exit
      await new Promise(r => setTimeout(r, 500));
    }
  } catch { /* no matches */ }
}

function spawnPty(
  key: string,
  sessionId: string,
  isNew: boolean,
  cwd: string,
  cols: number,
  rows: number,
  permissionMode?: string
): PtyEntry {
  if (!pty) throw new Error('node-pty is not installed. Run: npm install node-pty');

  // Kill existing PTY for this key if any
  if (ptyCache.has(key)) {
    destroyPty(key);
  }

  const args = sessionId
    ? ['--resume', sessionId]
    : [];

  // Add permission flags — default to bypass permissions
  if (permissionMode === 'bypassPermissions' || !permissionMode) {
    args.push('--dangerously-skip-permissions');
  } else {
    args.push('--permission-mode', permissionMode);
  }

  console.log(`[pty] Spawning: claude ${args.join(' ')} in ${cwd} (${cols}x${rows})`);

  const process = pty.spawn(CLAUDE_BIN, args, {
    name: 'xterm-256color',
    cols: cols || 80,
    rows: rows || 24,
    cwd,
    env: Object.fromEntries(Object.entries({ ...globalThis.process.env, TERM: 'xterm-256color' }).filter(([k]) => k !== 'CLAUDECODE')) as Record<string, string>,
  });

  const entry: PtyEntry = {
    process,
    sessionId,
    scrollback: [],
    attachedWs: null,
    exited: false,
    exitCode: null,
  };

  process.onData((data: string) => {
    appendScrollback(entry, data);
    if (entry.attachedWs) {
      sendData(entry.attachedWs, data);
    }
  });

  process.onExit(({ exitCode, signal }) => {
    console.log(`[pty] Process exited: key=${key} code=${exitCode} signal=${signal}`);
    track('pty_exit', { exit_code: exitCode, session_hash: hashId(sessionId || key) });
    entry.exited = true;
    entry.exitCode = exitCode;
    activePtySessions.delete(sessionId);
    if (entry.attachedWs) {
      sendControl(entry.attachedWs, { type: 'exit', exitCode, signal });
    }
    // Invalidate cache + notify clients so status updates to 'done'
    // Lazy import to avoid circular dependency (historyIndex → ptyManager → historyIndex)
    import('./historyIndex.js').then(m => m.invalidateSessionCache()).catch(() => {});
    if (sessionId) {
      eventBus.emitSessionEvent({ type: 'session:updated', sessionId });
    }
    // Clean up after a delay so client can still see exit message
    setTimeout(() => {
      if (ptyCache.get(key) === entry) {
        ptyCache.delete(key);
        clearIdleTimer(key);
      }
    }, 60_000);
  });

  if (sessionId) {
    activePtySessions.add(sessionId);
  }

  track('pty_spawn', { session_hash: hashId(sessionId || key) });

  ptyCache.set(key, entry);
  return entry;
}

async function attachWs(entry: PtyEntry, ws: WebSocket) {
  // Detach previous ws if any
  if (entry.attachedWs && entry.attachedWs !== ws) {
    sendControl(entry.attachedWs, { type: 'detached' });
  }
  entry.attachedWs = ws;
  clearIdleTimer(entry.sessionId);

  // Replay scrollback so client sees recent output
  if (entry.scrollback.length > 0) {
    for (const chunk of entry.scrollback) {
      sendData(ws, chunk);
    }
    sendControl(ws, { type: 'scrollback-end' });
  }

  // Tell client we're ready — send immediately, check for external claude in background
  if (entry.exited) {
    sendControl(ws, { type: 'exit', exitCode: entry.exitCode, signal: 0 });
  } else {
    // Send ready immediately so terminal is usable right away
    sendControl(ws, { type: 'ready', sessionId: entry.sessionId });
    // Check for external claude in background, send warning if found
    detectExternalClaude(entry.sessionId).then(warning => {
      if (warning && ws.readyState === WebSocket.OPEN) {
        sendControl(ws, { type: 'warning', message: warning });
      }
    });
  }
}

function detachWs(entry: PtyEntry, ws: WebSocket) {
  if (entry.attachedWs === ws) {
    entry.attachedWs = null;
    // Start idle timer - don't kill immediately
    if (!entry.exited) {
      startIdleTimer(entry.sessionId);
    }
  }
}

// --- Public handler ---

export function handleTerminalConnection(ws: WebSocket) {
  console.log('[pty] Client connected');
  let currentKey: string | null = null;

  ws.on('message', (raw: Buffer) => {
    const str = raw.toString();

    let msg: any;
    try {
      msg = JSON.parse(str);
    } catch {
      // Raw terminal input
      if (currentKey) {
        const entry = ptyCache.get(currentKey);
        if (entry && !entry.exited) {
          entry.process.write(str);
        }
      }
      return;
    }

    switch (msg.type) {
      case 'resume':
      case 'new': {
        const { sessionId, projectPath, permissionMode, cols, rows } = msg;
        const isNew = msg.type === 'new';
        const key = getPtyKey(sessionId, isNew);
        const cwd = (projectPath && fs.existsSync(projectPath)) ? projectPath : os.homedir();

        // Detach from previous PTY if switching
        if (currentKey && currentKey !== key) {
          const prev = ptyCache.get(currentKey);
          if (prev) detachWs(prev, ws);
        }
        currentKey = key;

        // Use async IIFE to allow await for stale process cleanup
        (async () => {
          try {
            const existing = ptyCache.get(key);
            if (existing && !existing.exited) {
              console.log(`[pty] Reattaching to existing PTY: ${key}`);
              try { existing.process.resize(cols || 80, rows || 24); } catch {}
              attachWs(existing, ws);
            } else {
              // Kill any stale claude processes holding this session lock
              await killStaleClaudeProcesses(sessionId);
              const entry = spawnPty(key, sessionId, isNew, cwd, cols, rows, permissionMode);
              attachWs(entry, ws);
            }
          } catch (err: any) {
            console.error(`[pty] Spawn error: ${err.message}`);
            sendControl(ws, { type: 'error', message: err.message });
          }
        })();
        break;
      }

      case 'input': {
        if (currentKey) {
          const entry = ptyCache.get(currentKey);
          if (entry && !entry.exited) {
            entry.process.write(msg.data);
          }
        }
        break;
      }

      case 'resize': {
        if (currentKey && msg.cols && msg.rows) {
          const entry = ptyCache.get(currentKey);
          if (entry && !entry.exited) {
            try { entry.process.resize(msg.cols, msg.rows); } catch {}
          }
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log('[pty] Client disconnected');
    if (currentKey) {
      const entry = ptyCache.get(currentKey);
      if (entry) detachWs(entry, ws);
      currentKey = null;
    }
  });

  ws.on('error', (err) => {
    console.error(`[pty] WebSocket error: ${err.message}`);
    if (currentKey) {
      const entry = ptyCache.get(currentKey);
      if (entry) detachWs(entry, ws);
      currentKey = null;
    }
  });
}
