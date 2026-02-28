#!/usr/bin/env node

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Fix node-pty spawn-helper permissions
try {
  execSync('find node_modules/node-pty -name spawn-helper -exec chmod +x {} + 2>/dev/null', { stdio: 'ignore' });
} catch {}

// Register MCP server with Claude Code
try {
  // Try claudit-mcp command first (available if bin links exist)
  // Fall back to node + script path for fresh installs
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const mcpScript = join(__dirname, 'claudit-mcp.js');

  try {
    execSync('claude mcp add claudit claudit-mcp -s user', { stdio: 'ignore' });
  } catch {
    execSync(`claude mcp add claudit -- node "${mcpScript}" -s user`, { stdio: 'ignore' });
  }
  console.log('[claudit] MCP server registered with Claude Code');
} catch {
  // claude CLI not available — skip silently
}
