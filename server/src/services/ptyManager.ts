import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { WebSocket } from 'ws';

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

// Resolve claude binary path at startup
const CLAUDE_BIN = (() => {
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    return 'claude';
  }
})();
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

function detectExternalClaude(sessionId: string): string | null {
  if (!sessionId) return null;

  // If we have an active PTY for this session, the claude process is ours — skip
  for (const entry of ptyCache.values()) {
    if (entry.sessionId === sessionId && !entry.exited) {
      return null;
    }
  }

  // No active PTY from us — check if someone else is using this session
  try {
    const output = execSync(
      `pgrep -af "claude.*--resume.*${sessionId}" 2>/dev/null || true`,
      { encoding: 'utf-8', timeout: 3000 }
    ).trim();
    if (output) {
      return `Another claude process is already using session ${sessionId}. Memory changes will not be shared between processes.`;
    }
  } catch {}
  return null;
}

function spawnPty(
  key: string,
  sessionId: string,
  isNew: boolean,
  cwd: string,
  cols: number,
  rows: number
): PtyEntry {
  if (!pty) throw new Error('node-pty is not installed. Run: npm install node-pty');

  // Kill existing PTY for this key if any
  if (ptyCache.has(key)) {
    destroyPty(key);
  }

  const args = sessionId
    ? ['--resume', sessionId]
    : [];

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
    entry.exited = true;
    entry.exitCode = exitCode;
    activePtySessions.delete(sessionId);
    if (entry.attachedWs) {
      sendControl(entry.attachedWs, { type: 'exit', exitCode, signal });
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

  ptyCache.set(key, entry);
  return entry;
}

function attachWs(entry: PtyEntry, ws: WebSocket) {
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

  // Tell client we're ready
  if (entry.exited) {
    sendControl(ws, { type: 'exit', exitCode: entry.exitCode, signal: 0 });
  } else {
    const warning = detectExternalClaude(entry.sessionId);
    const readyMsg: Record<string, any> = { type: 'ready', sessionId: entry.sessionId };
    if (warning) readyMsg.warning = warning;
    sendControl(ws, readyMsg);
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
        const { sessionId, projectPath, cols, rows } = msg;
        const isNew = msg.type === 'new';
        const key = getPtyKey(sessionId, isNew);
        const cwd = (projectPath && fs.existsSync(projectPath)) ? projectPath : os.homedir();

        // Detach from previous PTY if switching
        if (currentKey && currentKey !== key) {
          const prev = ptyCache.get(currentKey);
          if (prev) detachWs(prev, ws);
        }
        currentKey = key;

        try {
          // Check if there's an existing alive PTY for this session
          const existing = ptyCache.get(key);
          if (existing && !existing.exited) {
            console.log(`[pty] Reattaching to existing PTY: ${key}`);
            // Resize to match new client
            try { existing.process.resize(cols || 80, rows || 24); } catch {}
            attachWs(existing, ws);
          } else {
            // Spawn new PTY
            const entry = spawnPty(key, sessionId, isNew, cwd, cols, rows);
            attachWs(entry, ws);
          }
        } catch (err: any) {
          console.error(`[pty] Spawn error: ${err.message}`);
          sendControl(ws, { type: 'error', message: err.message });
        }
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
