import { spawn, execSync } from 'child_process';
import { readFileSync, writeFileSync, unlinkSync, mkdirSync, existsSync, openSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import { get } from 'http';

const DATA_DIR = join(homedir(), '.claudit');
const PID_FILE = join(DATA_DIR, 'claudit.pid');
const LOG_FILE = join(DATA_DIR, 'claudit.log');
const DEFAULT_PORT = 7433;

export function openBrowser(port) {
  const url = `http://localhost:${port || DEFAULT_PORT}`;
  const os = platform();
  try {
    if (os === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else if (os === 'linux') {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else if (os === 'win32') {
      spawn('cmd', ['/c', 'start', url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {}
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPid() {
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

export function startDaemon(clauditScript) {
  ensureDataDir();

  const existingPid = readPid();
  if (existingPid && isProcessRunning(existingPid)) {
    console.log(`Claudit is already running (PID ${existingPid})`);
    openBrowser(process.env.PORT || DEFAULT_PORT);
    return Promise.resolve();
  }

  const logFd = openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [clauditScript], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: { ...process.env },
  });

  writeFileSync(PID_FILE, String(child.pid));
  child.unref();

  const port = process.env.PORT || DEFAULT_PORT;
  console.log(`Claudit started (PID ${child.pid})`);
  console.log(`Log file: ${LOG_FILE}`);

  // Wait briefly for server to start, then open browser
  return new Promise((resolve) => {
    setTimeout(() => {
      openBrowser(port);
      resolve();
    }, 1500);
  });
}

function fetchSessions(port) {
  return new Promise((resolve) => {
    const req = get(`http://localhost:${port}/api/sessions`, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(3000, () => { req.destroy(); resolve([]); });
  });
}

export async function stopDaemon(force = false) {
  const pid = readPid();
  if (!pid) {
    console.log('Claudit is not running (no PID file)');
    return;
  }

  if (!isProcessRunning(pid)) {
    console.log(`Claudit is not running (stale PID ${pid})`);
    try { unlinkSync(PID_FILE); } catch {}
    return;
  }

  // Check for active sessions unless --force
  if (!force) {
    const port = process.env.PORT || DEFAULT_PORT;
    const groups = await fetchSessions(port);
    const active = [];
    for (const group of groups) {
      for (const s of group.sessions || []) {
        if (s.status === 'running') {
          active.push(s);
        }
      }
    }
    if (active.length > 0) {
      console.log(`Cannot stop: ${active.length} running session(s):`);
      for (const s of active) {
        const name = s.displayName || s.sessionId.slice(0, 8);
        console.log(`  - ${name}`);
      }
      console.log('\nUse "claudit stop --force" to stop anyway.');
      process.exit(1);
    }
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`Claudit stopped (PID ${pid})`);
  } catch (err) {
    console.error(`Failed to stop Claudit (PID ${pid}): ${err.message}`);
  }

  try { unlinkSync(PID_FILE); } catch {}
}

export function statusDaemon() {
  const pid = readPid();
  if (!pid) {
    console.log('Claudit is not running');
    return;
  }

  if (isProcessRunning(pid)) {
    console.log(`Claudit is running (PID ${pid})`);
  } else {
    console.log(`Claudit is not running (stale PID ${pid})`);
    try { unlinkSync(PID_FILE); } catch {}
  }
}

// --- Service management ---

const LAUNCHD_LABEL = 'com.claudit.server';
const LAUNCHD_PLIST_DIR = join(homedir(), 'Library', 'LaunchAgents');
const LAUNCHD_PLIST_PATH = join(LAUNCHD_PLIST_DIR, `${LAUNCHD_LABEL}.plist`);

const SYSTEMD_DIR = join(homedir(), '.config', 'systemd', 'user');
const SYSTEMD_UNIT_PATH = join(SYSTEMD_DIR, 'claudit.service');

function resolveClauditPath(clauditPath) {
  if (clauditPath) return clauditPath;
  try {
    return execSync('which claudit', { encoding: 'utf-8' }).trim();
  } catch {
    // Fall back to current script's node + claudit.js
    return null;
  }
}

function generatePlist(execPath) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${execPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
</dict>
</plist>`;
}

function generateSystemdUnit(execPath) {
  return `[Unit]
Description=Claudit Server
After=network.target

[Service]
Type=simple
ExecStart=${execPath}
Restart=on-failure
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}

[Install]
WantedBy=default.target
`;
}

export function installService(clauditPath) {
  ensureDataDir();
  const execPath = resolveClauditPath(clauditPath);
  if (!execPath) {
    console.error('Could not resolve claudit path. Pass it as an argument or ensure claudit is in PATH.');
    process.exit(1);
  }

  const os = platform();

  if (os === 'darwin') {
    mkdirSync(LAUNCHD_PLIST_DIR, { recursive: true });
    writeFileSync(LAUNCHD_PLIST_PATH, generatePlist(execPath));
    try {
      execSync(`launchctl load -w "${LAUNCHD_PLIST_PATH}"`, { stdio: 'inherit' });
    } catch {
      console.error('Failed to load launchd service.');
      process.exit(1);
    }
    console.log(`Launchd service installed: ${LAUNCHD_PLIST_PATH}`);
    console.log('Claudit will start automatically on login.');
  } else if (os === 'linux') {
    mkdirSync(SYSTEMD_DIR, { recursive: true });
    writeFileSync(SYSTEMD_UNIT_PATH, generateSystemdUnit(execPath));
    try {
      execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
      execSync('systemctl --user enable --now claudit.service', { stdio: 'inherit' });
    } catch {
      console.error('Failed to enable systemd service.');
      process.exit(1);
    }
    console.log(`Systemd service installed: ${SYSTEMD_UNIT_PATH}`);
    console.log('Claudit will start automatically on login.');
  } else {
    console.error(`Unsupported platform: ${os}. Service install is only supported on macOS and Linux.`);
    process.exit(1);
  }
}

export function uninstallService() {
  const os = platform();

  if (os === 'darwin') {
    try {
      execSync(`launchctl unload "${LAUNCHD_PLIST_PATH}"`, { stdio: 'inherit' });
    } catch {}
    try {
      unlinkSync(LAUNCHD_PLIST_PATH);
    } catch {}
    console.log('Launchd service uninstalled.');
  } else if (os === 'linux') {
    try {
      execSync('systemctl --user disable --now claudit.service', { stdio: 'inherit' });
    } catch {}
    try {
      unlinkSync(SYSTEMD_UNIT_PATH);
    } catch {}
    try {
      execSync('systemctl --user daemon-reload', { stdio: 'inherit' });
    } catch {}
    console.log('Systemd service uninstalled.');
  } else {
    console.error(`Unsupported platform: ${os}. Service uninstall is only supported on macOS and Linux.`);
    process.exit(1);
  }
}
