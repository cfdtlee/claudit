import cron, { ScheduledTask } from 'node-cron';
import { spawn, execFile } from 'child_process';
import {
  getAllTasks,
  getTask,
  updateTask,
  createExecution,
  updateExecution,
} from './cronStorage.js';
import { getAllTodos } from './todoStorage.js';
import { addManagedSession, renameManagedSession } from './managedSessions.js';
import { invalidateSessionCache } from './historyIndex.js';

const scheduledJobs = new Map<string, ScheduledTask>();
const MAX_OUTPUT_SIZE = 512 * 1024; // 512 KB limit per stream

const PRIORITY_ICON: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };

function formatTodosForPrompt(): string {
  const todos = getAllTodos().filter(t => !t.completed);
  if (todos.length === 0) return '(No pending todos)';
  return todos.map((t, i) => {
    const icon = PRIORITY_ICON[t.priority] || '⚪';
    let line = `${i + 1}. ${icon} [${t.priority}] ${t.title}`;
    if (t.description) line += `\n   ${t.description}`;
    return line;
  }).join('\n');
}

function resolvePrompt(prompt: string): string {
  if (!prompt.includes('{{todos}}')) return prompt;
  return prompt.replace(/\{\{todos\}\}/g, formatTodosForPrompt());
}

function appendCapped(current: string, chunk: string): string {
  if (current.length >= MAX_OUTPUT_SIZE) return current;
  const remaining = MAX_OUTPUT_SIZE - current.length;
  return current + (chunk.length <= remaining ? chunk : chunk.slice(0, remaining) + '\n[output truncated]');
}

function createSessionAsync(
  taskName: string, cwd: string | undefined, env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  return new Promise((resolve) => {
    const initPrompt = `Workflow task: ${taskName} — starting execution.`;
    const child = execFile(
      'claude',
      ['-p', '--output-format', 'json', '--max-turns', '1'],
      { cwd, encoding: 'utf-8', timeout: 60_000, env },
      (err, stdout) => {
        if (err) {
          console.warn(`[cron] Failed to create session for task ${taskName}, falling back:`, err.message);
          resolve(undefined);
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve(parsed.session_id || undefined);
        } catch {
          resolve(undefined);
        }
      },
    );
    child.stdin?.write(initPrompt);
    child.stdin?.end();
  });
}

async function executeTask(taskId: string) {
  const task = getTask(taskId);
  if (!task) return;

  console.log(`[cron] Executing task: ${task.name} (${taskId})`);

  const resolvedPrompt = resolvePrompt(task.prompt);
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE'));
  const cwd = task.projectPath || undefined;

  // Step 1: Create a session asynchronously (non-blocking)
  const sessionId = await createSessionAsync(task.name, cwd, cleanEnv);
  if (sessionId) {
    addManagedSession(sessionId, task.projectPath || '');
    renameManagedSession(sessionId, `Workflow: ${task.name}`);
    invalidateSessionCache();
    console.log(`[cron] Created session ${sessionId} for task ${task.name}`);
  }

  const exec = createExecution(taskId, sessionId);

  // Step 2: Execute the full prompt (resume session if available)
  const args = sessionId
    ? ['--session-id', sessionId, '--resume', '-p', '--output-format', 'text', '--dangerously-skip-permissions']
    : ['-p', '--output-format', 'text', '--dangerously-skip-permissions'];

  const child = spawn('claude', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd,
    env: cleanEnv,
  });

  let output = '';
  let errorOutput = '';

  child.stdout.on('data', (data: Buffer) => {
    output = appendCapped(output, data.toString());
  });

  child.stderr.on('data', (data: Buffer) => {
    errorOutput = appendCapped(errorOutput, data.toString());
  });

  child.stdin.write(resolvedPrompt);
  child.stdin.end();

  child.on('close', (code) => {
    const finishedAt = new Date().toISOString();
    const status = code === 0 ? 'success' as const : 'error' as const;
    updateExecution(exec.id, {
      finishedAt,
      status,
      output: output || undefined,
      error: code !== 0 ? (errorOutput || `Exit code: ${code}`) : undefined,
    });
    updateTask(taskId, { lastRun: finishedAt });
    console.log(`[cron] Task ${task.name} finished with status: ${status}`);
  });

  child.on('error', (err) => {
    updateExecution(exec.id, {
      finishedAt: new Date().toISOString(),
      status: 'error',
      error: err.message,
    });
    console.error(`[cron] Task ${task.name} spawn error:`, err.message);
  });
}

function scheduleTask(taskId: string, cronExpression: string) {
  // Remove existing schedule if any
  unscheduleTask(taskId);

  if (!cron.validate(cronExpression)) {
    console.error(`[cron] Invalid cron expression for task ${taskId}: ${cronExpression}`);
    return;
  }

  const job = cron.schedule(cronExpression, () => {
    executeTask(taskId);
  });

  scheduledJobs.set(taskId, job);
  console.log(`[cron] Scheduled task ${taskId}: ${cronExpression}`);
}

function unscheduleTask(taskId: string) {
  const existing = scheduledJobs.get(taskId);
  if (existing) {
    existing.stop();
    scheduledJobs.delete(taskId);
  }
}

export function initScheduler() {
  console.log('[cron] Initializing scheduler...');
  const tasks = getAllTasks();
  for (const task of tasks) {
    if (task.enabled) {
      scheduleTask(task.id, task.cronExpression);
    }
  }
  console.log(`[cron] Loaded ${tasks.filter(t => t.enabled).length} active tasks`);
}

export function refreshTask(taskId: string) {
  const task = getTask(taskId);
  if (!task || !task.enabled) {
    unscheduleTask(taskId);
  } else {
    scheduleTask(taskId, task.cronExpression);
  }
}

export function removeTask(taskId: string) {
  unscheduleTask(taskId);
}

export function runTaskNow(taskId: string) {
  executeTask(taskId);
}

export function stopAllJobs() {
  for (const [id, job] of scheduledJobs) {
    job.stop();
  }
  scheduledJobs.clear();
}
