import crypto from 'crypto';
import { TaskSession, Checkpoint } from '../types.js';
import { db } from './database.js';

const stmtByTask = db.prepare('SELECT * FROM task_sessions WHERE taskId = ? ORDER BY startedAt DESC');
const stmtById = db.prepare('SELECT * FROM task_sessions WHERE id = ?');
const stmtInsert = db.prepare(`
  INSERT INTO task_sessions (id, taskId, sessionId, agentId, startedAt, endedAt, resultSummary, resultPath, tokenUsage, checkpoints)
  VALUES (@id, @taskId, @sessionId, @agentId, @startedAt, @endedAt, @resultSummary, @resultPath, @tokenUsage, @checkpoints)
`);
const stmtDelete = db.prepare('DELETE FROM task_sessions WHERE id = ?');

function rowToTaskSession(row: any): TaskSession {
  const ts: TaskSession = {
    id: row.id,
    taskId: row.taskId,
    sessionId: row.sessionId,
    startedAt: row.startedAt,
  };
  if (row.agentId != null) ts.agentId = row.agentId;
  if (row.endedAt != null) ts.endedAt = row.endedAt;
  if (row.resultSummary != null) ts.resultSummary = row.resultSummary;
  if (row.resultPath != null) ts.resultPath = row.resultPath;
  if (row.tokenUsage != null) ts.tokenUsage = row.tokenUsage;
  if (row.checkpoints != null) ts.checkpoints = JSON.parse(row.checkpoints);
  return ts;
}

function taskSessionToParams(ts: TaskSession) {
  return {
    id: ts.id,
    taskId: ts.taskId,
    sessionId: ts.sessionId,
    agentId: ts.agentId ?? null,
    startedAt: ts.startedAt,
    endedAt: ts.endedAt ?? null,
    resultSummary: ts.resultSummary ?? null,
    resultPath: ts.resultPath ?? null,
    tokenUsage: ts.tokenUsage ?? null,
    checkpoints: ts.checkpoints ? JSON.stringify(ts.checkpoints) : null,
  };
}

export function getTaskSessions(taskId: string): TaskSession[] {
  return stmtByTask.all(taskId).map(rowToTaskSession);
}

export function getTaskSession(id: string): TaskSession | undefined {
  const row = stmtById.get(id);
  return row ? rowToTaskSession(row) : undefined;
}

export function createTaskSession(data: Omit<TaskSession, 'id'>): TaskSession {
  const ts: TaskSession = {
    ...data,
    id: crypto.randomUUID(),
  };
  stmtInsert.run(taskSessionToParams(ts));
  return ts;
}

export function updateTaskSession(id: string, updates: Partial<TaskSession>): TaskSession | null {
  const row = stmtById.get(id);
  if (!row) return null;
  const existing = rowToTaskSession(row);
  const merged: TaskSession = { ...existing, ...updates, id };
  stmtDelete.run(id);
  stmtInsert.run(taskSessionToParams(merged));
  return merged;
}

export function appendCheckpoint(id: string, checkpoint: Checkpoint): TaskSession | null {
  const existing = getTaskSession(id);
  if (!existing) return null;
  const checkpoints = [...(existing.checkpoints ?? []), checkpoint];
  return updateTaskSession(id, { checkpoints });
}
