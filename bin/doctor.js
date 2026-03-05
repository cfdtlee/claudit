#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, readFileSync, accessSync, constants } from 'fs';
import { join } from 'path';
import { homedir, platform, arch } from 'os';
import { createRequire } from 'module';
import { createServer } from 'net';
import { get } from 'http';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// ANSI colors (no external deps)
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

const DATA_DIR = join(homedir(), '.claudit');
const PID_FILE = join(DATA_DIR, 'claudit.pid');
const DEFAULT_PORT = 3001;
const EXPECTED_SCHEMA_VERSION = 8;

let passed = 0;
let warnings = 0;
let errors = 0;

function pass(label, detail) {
  passed++;
  console.log(`  ${green('✓')} ${label.padEnd(16)} ${detail}`);
}

function warn(label, detail) {
  warnings++;
  console.log(`  ${yellow('!')} ${label.padEnd(16)} ${yellow(detail)}`);
}

function fail(label, detail) {
  errors++;
  console.log(`  ${red('✗')} ${label.padEnd(16)} ${red(detail)}`);
}

function skip(label, detail) {
  console.log(`  ${dim('-')} ${dim(label.padEnd(16))} ${dim(detail)}`);
}

function section(name) {
  console.log(`\n  ${bold(name)}`);
}

function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
  });
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => { srv.close(() => resolve(true)); });
    srv.listen(port);
  });
}

const require = createRequire(import.meta.url);

// ── System ──────────────────────────────────────────

section('System');

pass('Node.js', process.version);
pass('Platform', `${platform()} ${arch()}`);

if (existsSync(DATA_DIR)) {
  try {
    accessSync(DATA_DIR, constants.W_OK);
    pass('Data directory', `${DATA_DIR} (writable)`);
  } catch {
    fail('Data directory', `${DATA_DIR} (not writable)`);
  }
} else {
  warn('Data directory', `${DATA_DIR} (does not exist)`);
}

// ── Dependencies ────────────────────────────────────

section('Dependencies');

// claude CLI
try {
  const claudePath = execSync('which claude', { encoding: 'utf-8' }).trim();
  let claudeVer = '';
  try {
    claudeVer = execSync('claude --version 2>/dev/null', { encoding: 'utf-8' }).trim();
  } catch {}
  pass('claude', `${claudePath}${claudeVer ? ` (${claudeVer})` : ''}`);
} catch {
  fail('claude', 'not found in PATH');
}

// better-sqlite3
try {
  require('better-sqlite3');
  pass('better-sqlite3', 'installed');
} catch (e) {
  fail('better-sqlite3', `load failed: ${e.message.split('\n')[0]}`);
}

// node-pty
try {
  require('node-pty');
  pass('node-pty', 'installed');
} catch {
  warn('node-pty', 'not installed (terminal feature disabled)');
}

// ── Database ────────────────────────────────────────

section('Database');

const dbName = process.env.NODE_ENV === 'development' ? 'claudit-dev.db' : 'claudit.db';
const dbPath = join(DATA_DIR, dbName);

if (!existsSync(dbPath)) {
  warn('Path', `${dbPath} (does not exist — first run?)`);
} else {
  try {
    accessSync(dbPath, constants.R_OK | constants.W_OK);
    pass('Path', dbPath);
  } catch {
    fail('Path', `${dbPath} (not readable/writable)`);
  }

  // Try opening DB
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });

    const version = db.pragma('user_version', { simple: true });
    if (version >= EXPECTED_SCHEMA_VERSION) {
      pass('Schema version', `${version} (up to date)`);
    } else {
      warn('Schema version', `${version} (expected ${EXPECTED_SCHEMA_VERSION}, will migrate on next start)`);
    }

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
    if (tables.length > 0) {
      pass('Tables', tables.join(', '));
    } else {
      warn('Tables', 'none found');
    }

    db.close();
  } catch (e) {
    fail('DB open', `failed: ${e.message.split('\n')[0]}`);
  }
}

// ── Server ──────────────────────────────────────────

section('Server');

const port = parseInt(process.env.PORT, 10) || DEFAULT_PORT;

// Daemon PID check
let daemonRunning = false;
try {
  const pidStr = readFileSync(PID_FILE, 'utf-8').trim();
  const pid = parseInt(pidStr, 10);
  if (!Number.isNaN(pid)) {
    try {
      process.kill(pid, 0);
      daemonRunning = true;
      pass('Daemon', `running (PID ${pid})`);
    } catch {
      warn('Daemon', `stale PID file (PID ${pid} not running)`);
    }
  } else {
    warn('Daemon', 'invalid PID file');
  }
} catch {
  skip('Daemon', 'not running');
}

// Port check
const portAvailable = await checkPortAvailable(port);
if (daemonRunning) {
  if (!portAvailable) {
    pass('Port ' + port, 'in use (by daemon)');
  } else {
    warn('Port ' + port, 'available (daemon running but port free — wrong port?)');
  }
} else {
  if (portAvailable) {
    pass('Port ' + port, 'available');
  } else {
    warn('Port ' + port, 'in use by another process');
  }
}

// Health check (only if daemon running)
if (daemonRunning) {
  const health = await httpGet(`http://localhost:${port}/api/health`);
  if (health && health.status === 'ok') {
    pass('Health', `http://localhost:${port}/api/health OK`);
  } else {
    fail('Health', `http://localhost:${port}/api/health not responding`);
  }
}

// ── Services (requires running server) ──────────────

section('Services (requires running server)');

if (daemonRunning) {
  const dashboard = await httpGet(`http://localhost:${port}/api/dashboard`);
  if (dashboard) {
    const mayorOnline = dashboard.systemStatus?.mayorOnline;
    if (mayorOnline === true) {
      pass('Mayor', 'online');
    } else if (mayorOnline === false) {
      skip('Mayor', 'offline');
    } else {
      skip('Mayor', 'unknown');
    }

    const witnessRunning = dashboard.systemStatus?.witnessRunning;
    if (witnessRunning === true) {
      pass('Witness', 'running');
    } else if (witnessRunning === false) {
      skip('Witness', 'stopped');
    } else {
      skip('Witness', 'unknown');
    }
  } else {
    fail('Dashboard', 'could not fetch /api/dashboard');
  }
} else {
  skip('Mayor', 'offline (server not running)');
  skip('Witness', 'unknown (server not running)');
}

// ── Summary ─────────────────────────────────────────

console.log('');
const parts = [];
parts.push(green(`${passed} passed`));
if (warnings > 0) parts.push(yellow(`${warnings} warnings`));
if (errors > 0) parts.push(red(`${errors} errors`));
console.log(`  ${parts.join(', ')}`);
console.log('');

process.exit(errors > 0 ? 1 : 0);
