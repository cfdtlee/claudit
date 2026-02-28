#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

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

Usage: claudit [options]

Options:
  -h, --help     Show this help message
  -v, --version  Show version number

Environment variables:
  PORT           Server port (default: 3001)
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
