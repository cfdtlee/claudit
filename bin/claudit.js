#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

process.env.CLAUDIT_ROOT = join(__dirname, '..');

await import('../server/dist/server/src/index.js');
