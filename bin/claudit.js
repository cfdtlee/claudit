#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { startDaemon, stopDaemon, statusDaemon, installService, uninstallService, openBrowser } from './daemon.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Subcommand routing
const cmd = process.argv[2];

if (cmd === 'start') {
  await startDaemon(__filename);
  process.exit(0);
}

if (cmd === 'stop') {
  const force = process.argv.includes('--force') || process.argv.includes('-f');
  await stopDaemon(force);
  process.exit(0);
}

if (cmd === 'status') {
  statusDaemon();
  process.exit(0);
}

if (cmd === 'open') {
  openBrowser(process.env.PORT);
  process.exit(0);
}

if (cmd === 'doctor') {
  await import('./doctor.js');
  process.exit(0);
}

if (cmd === 'service') {
  const sub = process.argv[3];
  if (sub === 'install') {
    installService();
    process.exit(0);
  }
  if (sub === 'uninstall') {
    uninstallService();
    process.exit(0);
  }
  console.error('Usage: claudit service <install|uninstall>');
  process.exit(1);
}

// --version / -v
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
  console.log(pkg.version);
  process.exit(0);
}

// --help / -h
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));
  console.log(`claudit v${pkg.version} — ${pkg.description}

Usage: claudit [command] [options]

Commands:
  (none)              Start server in foreground
  start               Start background daemon and open browser
  stop [--force]      Stop background daemon (blocked if sessions active)
  status              Show daemon status
  open                Open dashboard in browser
  doctor              Check system health and diagnose issues
  service install     Install as boot service (launchd/systemd)
  service uninstall   Uninstall boot service

Options:
  -h, --help     Show this help message
  -v, --version  Show version number

Environment variables:
  PORT           Server port (default: 7433)
  NODE_ENV       Set to "development" for dev mode

MCP Server:
  claudit-mcp provides management tools for Claude Code.
  Add to ~/.claude/settings.json:

  {
    "mcpServers": {
      "claudit": {
        "command": "claudit-mcp"
      }
    }
  }

  Or run: claude mcp add claudit claudit-mcp

  Tools: list_todos, get_todo, create_todo, update_todo, delete_todo`);
  process.exit(0);
}

// Check native dependencies before starting
const require = createRequire(import.meta.url);
try {
  require('node-pty');
} catch {
  console.error('\x1b[31m[claudit] Error: node-pty is not installed.\x1b[0m');
  console.error('');
  console.error('This is a native module that requires C++ build tools.');
  console.error('Please install them first, then reinstall claudit:');
  console.error('');
  console.error('  macOS:   xcode-select --install');
  console.error('  Linux:   sudo apt install build-essential python3');
  console.error('');
  console.error('Then run:  npm install -g claudit --force');
  process.exit(1);
}

process.env.CLAUDIT_ROOT = rootDir;

await import('../server/dist/server/src/index.js');
