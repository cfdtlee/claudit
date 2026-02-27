import crypto from 'crypto';
import { CronTask, CronExecution } from '../types.js';
import { db } from './database.js';

const MAX_EXECUTIONS_PER_TASK = 100;

// --- Prepared statements: Tasks ---

const stmtAllTasks = db.prepare('SELECT * FROM cron_tasks');
const stmtTaskById = db.prepare('SELECT * FROM cron_tasks WHERE id = ?');
const stmtInsertTask = db.prepare(`
  INSERT INTO cron_tasks (id, name, cronExpression, prompt, enabled, projectPath, lastRun, nextRun, createdAt)
  VALUES (@id, @name, @cronExpression, @prompt, @enabled, @projectPath, @lastRun, @nextRun, @createdAt)
`);
const stmtDeleteTask = db.prepare('DELETE FROM cron_tasks WHERE id = ?');

// --- Prepared statements: Executions ---

const stmtExecsByTask = db.prepare(
  'SELECT * FROM cron_executions WHERE taskId = ? ORDER BY startedAt DESC'
);
const stmtInsertExec = db.prepare(`
  INSERT INTO cron_executions (id, taskId, startedAt, finishedAt, status, output, error)
  VALUES (@id, @taskId, @startedAt, @finishedAt, @status, @output, @error)
`);
const stmtExecById = db.prepare('SELECT * FROM cron_executions WHERE id = ?');
const stmtDeleteExec = db.prepare('DELETE FROM cron_executions WHERE id = ?');

// Trim: keep latest MAX_EXECUTIONS_PER_TASK, delete the rest
const stmtTrimExecs = db.prepare(`
  DELETE FROM cron_executions WHERE taskId = ? AND id NOT IN (
    SELECT id FROM cron_executions WHERE taskId = ? ORDER BY startedAt DESC LIMIT ?
  )
`);

// --- Row mappers ---

function rowToTask(row: any): CronTask {
  const task: CronTask = {
    id: row.id,
    name: row.name,
    cronExpression: row.cronExpression,
    prompt: row.prompt,
    enabled: row.enabled === 1,
    createdAt: row.createdAt,
  };
  if (row.projectPath != null) task.projectPath = row.projectPath;
  if (row.lastRun != null) task.lastRun = row.lastRun;
  if (row.nextRun != null) task.nextRun = row.nextRun;
  return task;
}

function taskToParams(task: CronTask) {
  return {
    id: task.id,
    name: task.name,
    cronExpression: task.cronExpression,
    prompt: task.prompt,
    enabled: task.enabled ? 1 : 0,
    projectPath: task.projectPath ?? null,
    lastRun: task.lastRun ?? null,
    nextRun: task.nextRun ?? null,
    createdAt: task.createdAt,
  };
}

function rowToExec(row: any): CronExecution {
  const exec: CronExecution = {
    id: row.id,
    taskId: row.taskId,
    startedAt: row.startedAt,
    status: row.status,
  };
  if (row.finishedAt != null) exec.finishedAt = row.finishedAt;
  if (row.output != null) exec.output = row.output;
  if (row.error != null) exec.error = row.error;
  return exec;
}

// --- Tasks ---

export function getAllTasks(): CronTask[] {
  return stmtAllTasks.all().map(rowToTask);
}

export function getTask(id: string): CronTask | undefined {
  const row = stmtTaskById.get(id);
  return row ? rowToTask(row) : undefined;
}

export function createTask(data: Omit<CronTask, 'id' | 'createdAt'>): CronTask {
  const task: CronTask = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  stmtInsertTask.run(taskToParams(task));
  return task;
}

export function updateTask(id: string, updates: Partial<CronTask>): CronTask | null {
  const existing = getTask(id);
  if (!existing) return null;
  const merged: CronTask = { ...existing, ...updates, id };
  stmtDeleteTask.run(id);
  stmtInsertTask.run(taskToParams(merged));
  return merged;
}

export function deleteTask(id: string): boolean {
  // CASCADE will delete related executions
  const result = stmtDeleteTask.run(id);
  return result.changes > 0;
}

// --- Executions ---

export function getTaskExecutions(taskId: string): CronExecution[] {
  return stmtExecsByTask.all(taskId).map(rowToExec);
}

export function createExecution(taskId: string): CronExecution {
  const exec: CronExecution = {
    id: crypto.randomUUID(),
    taskId,
    startedAt: new Date().toISOString(),
    status: 'running',
  };
  stmtInsertExec.run({
    id: exec.id,
    taskId: exec.taskId,
    startedAt: exec.startedAt,
    finishedAt: null,
    status: exec.status,
    output: null,
    error: null,
  });
  // Trim old executions
  stmtTrimExecs.run(taskId, taskId, MAX_EXECUTIONS_PER_TASK);
  return exec;
}

export function updateExecution(id: string, updates: Partial<CronExecution>): CronExecution | null {
  const row = stmtExecById.get(id);
  if (!row) return null;
  const existing = rowToExec(row);
  const merged: CronExecution = { ...existing, ...updates, id };
  stmtDeleteExec.run(id);
  stmtInsertExec.run({
    id: merged.id,
    taskId: merged.taskId,
    startedAt: merged.startedAt,
    finishedAt: merged.finishedAt ?? null,
    status: merged.status,
    output: merged.output ?? null,
    error: merged.error ?? null,
  });
  return merged;
}
