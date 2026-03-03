import { EventEmitter } from 'events';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ClaudeProcess, CLAUDE_BIN } from './claudeProcess.js';
import { getSetting, setSetting } from './settingsStorage.js';
import { PROJECTS_DIR, readHistoryEntries } from './sessionScanner.js';

export const mayorEmitter = new EventEmitter();

let mayorProcess: ClaudeProcess | null = null;
let mayorSessionId: string | null = null;

const MAYOR_SYSTEM_PROMPT = `You are Mayor, the orchestrator of claudit.
Your job is to manage tasks, not execute them.

Responsibilities:
1. When asked to decompose a task, break it into subtasks (max 2 levels deep)
2. Assign tasks to agents based on their specialty
3. Never write code or execute tools directly
4. When creating subtasks, output them as JSON for claudit to create

Output subtask plans as:
SUBTASK_PLAN: [{"title": "...", "prompt": "...", "assignee": "agentId"}]`;

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
 * Pipes prompt via stdin (claude -p reads from stdin, not positional args).
 * Fully async — does not block the event loop.
 */
function createNewMayorSession(): Promise<string> {
  return new Promise((resolve, reject) => {
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE'),
    );

    const proc = spawn(CLAUDE_BIN, ['-p', '--output-format', 'json'], {
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
      // claude -p outputs JSON on both stdout and stderr; check both
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

    // Write prompt to stdin and close it
    proc.stdin.write('You are Mayor. Reply with: MAYOR_READY');
    proc.stdin.end();
  });
}

export async function ensureMayorRunning(): Promise<string> {
  // Check if we already have a running mayor
  if (mayorProcess && mayorProcess.isAlive() && mayorSessionId) {
    return mayorSessionId;
  }

  // Check settings for existing session
  const savedId = getSetting('mayorSessionId');
  if (savedId) {
    mayorSessionId = savedId;
    try {
      mayorProcess = new ClaudeProcess(savedId, os.homedir());
      setupMayorListeners(mayorProcess);
      mayorProcess.start();
      console.log(`[mayor] Resumed existing session: ${savedId}`);
      return savedId;
    } catch (err) {
      console.error('[mayor] Failed to resume existing session:', err);
      // Fall through to create new
    }
  }

  // Create new mayor session with a real Claude session ID
  const newSessionId = await createNewMayorSession();
  mayorSessionId = newSessionId;
  setSetting('mayorSessionId', newSessionId);

  mayorProcess = new ClaudeProcess(newSessionId, os.homedir());
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
  });

  proc.on('error', (message: string) => {
    console.error(`[mayor] Error: ${message}`);
    mayorEmitter.emit('error', message);
  });
}

export async function sendToMayor(message: string): Promise<void> {
  if (!mayorProcess || !mayorProcess.isAlive()) {
    await ensureMayorRunning();
  }
  if (mayorProcess) {
    mayorProcess.sendMessage(message);
  }
}

export function stopMayor(): void {
  if (mayorProcess) {
    mayorProcess.stop();
    mayorProcess = null;
  }
}
