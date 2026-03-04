import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClaudeProcess, CLAUDE_BIN } from './claudeProcess.js';
import { getSetting, setSetting } from './settingsStorage.js';
import { PROJECTS_DIR, readHistoryEntries } from './sessionScanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const mayorEmitter = new EventEmitter();

let mayorProcess: ClaudeProcess | null = null;
let mayorSessionId: string | null = null;
let isCreatingMayor = false;
let createMayorPromise: Promise<string> | null = null;

const DATA_DIR = path.join(os.homedir(), '.claudit');
const MCP_CONFIG_PATH = path.join(DATA_DIR, 'mayor-mcp.json');

const MAYOR_SYSTEM_PROMPT = `You are Mayor, the orchestrator of claudit — an AI task management system.

You have access to tools provided by the "claudit" MCP server. Use them to manage tasks, agents, and sessions.

## Your Responsibilities
1. When asked to handle a task, use get_tasks and get_agents to understand current state
2. Break complex tasks into subtasks using create_task (max 2 levels deep)
3. Assign tasks to agents using assign_task based on their specialty
4. Spawn agent sessions using spawn_session when ready to execute
5. Monitor progress via get_messages (check for completion/failure events)
6. Use notify_human to alert the user about important events
7. Use sleep to wait for agents to complete before checking again
8. Use handoff to save context summary before session ends

## Rules
- NEVER write code yourself — delegate to agents
- ALWAYS use tools — never output raw JSON or text commands
- ONLY spawn tasks with status 'pending' — never spawn running/done/failed/cancelled/waiting tasks
- Before calling spawn_session, confirm task.status === 'pending' — if it's anything else, skip it
- Never spawn duplicate sessions for the same task
- Check get_messages regularly for agent completion/failure events
- When all subtasks are done, mark the parent task as done
- If a task fails, NEVER set it back to 'pending' yourself — use notify_human to let the user decide whether to retry
- NEVER change a task's status to 'pending' — only humans can do that`;

/**
 * Get the absolute path to the MCP server entry point.
 * Works both in dev (ts source) and prod (compiled js).
 */
function getMcpServerEntryPath(): string {
  // In production, use the bin entry point
  const binPath = path.resolve(process.cwd(), 'bin', 'claudit-mcp.js');
  if (fs.existsSync(binPath)) return binPath;

  // Fallback: try from package root
  const rootBin = path.resolve(__dirname, '..', '..', '..', 'bin', 'claudit-mcp.js');
  if (fs.existsSync(rootBin)) return rootBin;

  return binPath; // default
}

/**
 * Write MCP config file for Mayor/agent sessions to use.
 */
function writeMcpConfig(): string {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const config = {
    mcpServers: {
      claudit: {
        command: 'node',
        args: [getMcpServerEntryPath()],
      },
    },
  };

  fs.writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`[mayor] Wrote MCP config to ${MCP_CONFIG_PATH}`);
  return MCP_CONFIG_PATH;
}

/**
 * Get the path to the MCP config file, creating it if needed.
 */
export function getMcpConfigPath(): string {
  writeMcpConfig();
  return MCP_CONFIG_PATH;
}

export function getMayorSessionId(): string | null {
  return mayorSessionId;
}

export function isMayorOnline(): boolean {
  return mayorProcess !== null && mayorProcess.isAlive();
}

/** Find the real project path where the mayor session lives */
export function getMayorProjectPath(): string {
  if (!mayorSessionId || !fs.existsSync(PROJECTS_DIR)) return os.homedir();

  for (const dir of fs.readdirSync(PROJECTS_DIR)) {
    if (fs.existsSync(path.join(PROJECTS_DIR, dir, `${mayorSessionId}.jsonl`))) {
      const { projectPaths } = readHistoryEntries();
      return projectPaths.get(dir) || os.homedir();
    }
  }
  return os.homedir();
}

/**
 * Create a real Claude session via `claude -p` and return the session_id.
 */
function createNewMayorSession(): Promise<string> {
  return new Promise((resolve, reject) => {
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE'),
    );

    const mcpConfigPath = getMcpConfigPath();
    const proc = spawn(CLAUDE_BIN, ['-p', '--output-format', 'json', '--dangerously-skip-permissions', '--mcp-config', mcpConfigPath], {
      cwd: os.homedir(),
      env: cleanEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('createNewMayorSession timed out after 30s'));
    }, 30000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const output = stdout || stderr;
      const lines = output.trim().split('\n');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.session_id) {
            console.log(`[mayor] Created new session: ${parsed.session_id}`);
            return resolve(parsed.session_id);
          }
        } catch { /* skip non-JSON lines */ }
      }
      reject(new Error(`Failed to get session_id (exit=${code}): ${output.slice(0, 200)}`));
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.stdin.write('You are Mayor. Reply with: MAYOR_READY');
    proc.stdin.end();
  });
}

export async function ensureMayorRunning(): Promise<string> {
  // Already alive — fast path
  if (mayorProcess && mayorProcess.isAlive() && mayorSessionId) {
    return mayorSessionId;
  }

  // Another caller is already creating — coalesce onto the same promise
  if (isCreatingMayor && createMayorPromise) {
    return createMayorPromise;
  }

  isCreatingMayor = true;
  createMayorPromise = _doEnsureMayorRunning();

  try {
    return await createMayorPromise;
  } finally {
    isCreatingMayor = false;
    createMayorPromise = null;
  }
}

async function _doEnsureMayorRunning(): Promise<string> {
  // Always kill any existing process before spawning a new one
  if (mayorProcess) {
    console.log('[mayor] Stopping stale mayor process before respawn');
    mayorProcess.stop();
    mayorProcess = null;
  }

  // Try resuming saved session
  const savedId = getSetting('mayorSessionId');
  if (savedId) {
    mayorSessionId = savedId;
    try {
      const mcpConfigPath = getMcpConfigPath();
      mayorProcess = new ClaudeProcess(savedId, os.homedir(), ['--mcp-config', mcpConfigPath]);
      setupMayorListeners(mayorProcess);
      mayorProcess.start();
      console.log(`[mayor] Resumed existing session: ${savedId}`);
      return savedId;
    } catch (err) {
      console.error('[mayor] Failed to resume existing session:', err);
      // Clean up failed process
      if (mayorProcess) {
        mayorProcess.stop();
        mayorProcess = null;
      }
    }
  }

  // Create brand-new session
  const newSessionId = await createNewMayorSession();
  mayorSessionId = newSessionId;
  setSetting('mayorSessionId', newSessionId);

  const mcpConfigPath = getMcpConfigPath();
  mayorProcess = new ClaudeProcess(newSessionId, os.homedir(), ['--mcp-config', mcpConfigPath]);
  setupMayorListeners(mayorProcess);
  mayorProcess.start();

  console.log(`[mayor] Created new session: ${newSessionId}`);
  return newSessionId;
}

function setupMayorListeners(proc: ClaudeProcess) {
  proc.on('assistant_text', (text: string) => {
    mayorEmitter.emit('response', text);
  });

  proc.on('done', () => {
    mayorEmitter.emit('done');

    // Check for handoff summary — if present, re-invoke Mayor after a short delay
    const handoff = getSetting('mayorHandoffSummary');
    if (handoff) {
      setSetting('mayorHandoffSummary', '');
      console.log('[mayor] Handoff detected, re-invoking Mayor in 2s...');
      setTimeout(async () => {
        try {
          await sendToMayor(`Resuming from handoff. Previous context: ${handoff}\n\nCheck get_messages() and get_tasks() for current state.`);
        } catch (err) {
          console.error('[mayor] Failed to re-invoke after handoff:', err);
        }
      }, 2000);
    }
  });

  proc.on('error', (message: string) => {
    console.error(`[mayor] Error: ${message}`);
    mayorEmitter.emit('error', message);
  });
}

export async function sendToMayor(message: string): Promise<void> {
  if (!mayorProcess || !mayorProcess.isAlive()) {
    console.log(`[mayor] sendToMayor: process dead (proc=${!!mayorProcess}, alive=${mayorProcess?.isAlive()}), respawning...`);
    await ensureMayorRunning();
  }
  if (mayorProcess) {
    mayorProcess.sendMessage(message);
  } else {
    console.error('[mayor] sendToMayor: no mayor process after ensureMayorRunning');
  }
}

export function stopMayor(): void {
  if (mayorProcess) {
    mayorProcess.stop();
    mayorProcess = null;
  }
}
