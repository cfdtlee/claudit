import crypto from 'crypto';
import { Task, TaskStatus } from '../types.js';
import { db } from './database.js';

const stmtAll = db.prepare('SELECT * FROM tasks ORDER BY "order" ASC, createdAt DESC');
const stmtById = db.prepare('SELECT * FROM tasks WHERE id = ?');
const stmtByProject = db.prepare('SELECT * FROM tasks WHERE projectId = ? ORDER BY "order" ASC, createdAt DESC');
const stmtByAssignee = db.prepare('SELECT * FROM tasks WHERE assignee = ? ORDER BY "order" ASC, createdAt DESC');
const stmtByParent = db.prepare('SELECT * FROM tasks WHERE parent_id = ? ORDER BY "order" ASC, createdAt DESC');
const stmtByGroup = db.prepare('SELECT * FROM tasks WHERE groupId = ? ORDER BY "order" ASC, createdAt DESC');
const stmtInsert = db.prepare(`
  INSERT INTO tasks (
    id, title, description, prompt, status, created_by, errorMessage, "order", priority,
    parent_id, discovered_from, blocked_by, assignee, projectId, groupId,
    sessionId, sessionLabel, worktreeId, branch, prUrl, workingDir, model, permissionMode,
    retryCount, maxRetries, timeoutMs, taskType, resultSummary, resultPath,
    filesChanged, diffSummary, tokenUsage, completionMode, acceptanceCriteria,
    tags, createdAt, updatedAt, startedAt, completedAt, dueDate
  ) VALUES (
    @id, @title, @description, @prompt, @status, @created_by, @errorMessage, @order, @priority,
    @parent_id, @discovered_from, @blocked_by, @assignee, @projectId, @groupId,
    @sessionId, @sessionLabel, @worktreeId, @branch, @prUrl, @workingDir, @model, @permissionMode,
    @retryCount, @maxRetries, @timeoutMs, @taskType, @resultSummary, @resultPath,
    @filesChanged, @diffSummary, @tokenUsage, @completionMode, @acceptanceCriteria,
    @tags, @createdAt, @updatedAt, @startedAt, @completedAt, @dueDate
  )
`);
const stmtDelete = db.prepare('DELETE FROM tasks WHERE id = ?');
const stmtUpdateOrder = db.prepare('UPDATE tasks SET "order" = ? WHERE id = ?');

function rowToTask(row: any): Task {
  const task: Task = {
    id: row.id,
    title: row.title,
    status: row.status as TaskStatus,
    created_by: row.created_by,
    order: row.order ?? 0,
    retryCount: row.retryCount ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (row.description != null) task.description = row.description;
  if (row.prompt != null) task.prompt = row.prompt;
  if (row.errorMessage != null) task.errorMessage = row.errorMessage;
  if (row.priority != null) task.priority = row.priority;
  if (row.parent_id != null) task.parent_id = row.parent_id;
  if (row.discovered_from != null) task.discovered_from = row.discovered_from;
  if (row.blocked_by != null) task.blocked_by = JSON.parse(row.blocked_by);
  if (row.assignee != null) task.assignee = row.assignee;
  if (row.projectId != null) task.projectId = row.projectId;
  if (row.groupId != null) task.groupId = row.groupId;
  if (row.sessionId != null) task.sessionId = row.sessionId;
  if (row.sessionLabel != null) task.sessionLabel = row.sessionLabel;
  if (row.worktreeId != null) task.worktreeId = row.worktreeId;
  if (row.branch != null) task.branch = row.branch;
  if (row.prUrl != null) task.prUrl = row.prUrl;
  if (row.workingDir != null) task.workingDir = row.workingDir;
  if (row.model != null) task.model = row.model;
  if (row.permissionMode != null) task.permissionMode = row.permissionMode;
  if (row.maxRetries != null) task.maxRetries = row.maxRetries;
  if (row.timeoutMs != null) task.timeoutMs = row.timeoutMs;
  if (row.taskType != null) task.taskType = row.taskType;
  if (row.resultSummary != null) task.resultSummary = row.resultSummary;
  if (row.resultPath != null) task.resultPath = row.resultPath;
  if (row.filesChanged != null) task.filesChanged = JSON.parse(row.filesChanged);
  if (row.diffSummary != null) task.diffSummary = row.diffSummary;
  if (row.tokenUsage != null) task.tokenUsage = row.tokenUsage;
  if (row.completionMode != null) task.completionMode = row.completionMode;
  if (row.acceptanceCriteria != null) task.acceptanceCriteria = row.acceptanceCriteria;
  if (row.tags != null) task.tags = JSON.parse(row.tags);
  if (row.startedAt != null) task.startedAt = row.startedAt;
  if (row.completedAt != null) task.completedAt = row.completedAt;
  if (row.dueDate != null) task.dueDate = row.dueDate;
  return task;
}

function taskToParams(task: Task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? null,
    prompt: task.prompt ?? null,
    status: task.status,
    created_by: task.created_by,
    errorMessage: task.errorMessage ?? null,
    order: task.order ?? 0,
    priority: task.priority ?? null,
    parent_id: task.parent_id ?? null,
    discovered_from: task.discovered_from ?? null,
    blocked_by: task.blocked_by ? JSON.stringify(task.blocked_by) : null,
    assignee: task.assignee ?? null,
    projectId: task.projectId ?? null,
    groupId: task.groupId ?? null,
    sessionId: task.sessionId ?? null,
    sessionLabel: task.sessionLabel ?? null,
    worktreeId: task.worktreeId ?? null,
    branch: task.branch ?? null,
    prUrl: task.prUrl ?? null,
    workingDir: task.workingDir ?? null,
    model: task.model ?? null,
    permissionMode: task.permissionMode ?? null,
    retryCount: task.retryCount ?? 0,
    maxRetries: task.maxRetries ?? null,
    timeoutMs: task.timeoutMs ?? null,
    taskType: task.taskType ?? null,
    resultSummary: task.resultSummary ?? null,
    resultPath: task.resultPath ?? null,
    filesChanged: task.filesChanged ? JSON.stringify(task.filesChanged) : null,
    diffSummary: task.diffSummary ?? null,
    tokenUsage: task.tokenUsage ?? null,
    completionMode: task.completionMode ?? null,
    acceptanceCriteria: task.acceptanceCriteria ?? null,
    tags: task.tags ? JSON.stringify(task.tags) : null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt ?? null,
    completedAt: task.completedAt ?? null,
    dueDate: task.dueDate ?? null,
  };
}

interface TaskFilters {
  projectId?: string;
  assignee?: string;
  status?: TaskStatus;
  groupId?: string;
}

export function getAllTasks(filters?: TaskFilters): Task[] {
  if (filters?.projectId) return stmtByProject.all(filters.projectId).map(rowToTask);
  if (filters?.assignee) return stmtByAssignee.all(filters.assignee).map(rowToTask);
  if (filters?.groupId) return stmtByGroup.all(filters.groupId).map(rowToTask);
  let tasks = stmtAll.all().map(rowToTask);
  if (filters?.status) tasks = tasks.filter(t => t.status === filters.status);
  return tasks;
}

export function getTask(id: string): Task | undefined {
  const row = stmtById.get(id);
  return row ? rowToTask(row) : undefined;
}

export function getSubtasks(parentId: string): Task[] {
  return stmtByParent.all(parentId).map(rowToTask);
}

export function getTasksByProject(projectId: string): Task[] {
  return stmtByProject.all(projectId).map(rowToTask);
}

export function getTasksByAssignee(agentId: string): Task[] {
  return stmtByAssignee.all(agentId).map(rowToTask);
}

export function createTask(data: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
  const now = new Date().toISOString();
  const task: Task = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  stmtInsert.run(taskToParams(task));
  return task;
}

export function updateTask(id: string, updates: Partial<Task>): Task | null {
  const existing = getTask(id);
  if (!existing) return null;
  const merged: Task = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
  stmtDelete.run(id);
  stmtInsert.run(taskToParams(merged));
  return merged;
}

export function deleteTask(id: string): boolean {
  const result = stmtDelete.run(id);
  return result.changes > 0;
}

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['running', 'cancelled'],
  running: ['paused', 'waiting', 'done', 'failed', 'cancelled'],
  waiting: ['running', 'cancelled'],
  draft: ['pending', 'cancelled'],
  paused: ['running', 'cancelled'],
  done: ['pending'],
  failed: ['pending', 'cancelled'],
  cancelled: ['pending'],
};

export function updateTaskStatus(id: string, newStatus: TaskStatus): Task | null {
  const existing = getTask(id);
  if (!existing) return null;
  const allowed = VALID_TRANSITIONS[existing.status];
  if (!allowed?.includes(newStatus)) return null;
  const updates: Partial<Task> = { status: newStatus };
  if (newStatus === 'running') updates.startedAt = new Date().toISOString();
  if (newStatus === 'done' || newStatus === 'failed' || newStatus === 'cancelled') {
    updates.completedAt = new Date().toISOString();
  }
  return updateTask(id, updates);
}

export function countTasksByStatus(status: TaskStatus): number {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM tasks WHERE status = ?').get(status) as any;
  return row?.cnt ?? 0;
}

export function getTasksCompletedToday(): Task[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();
  return db.prepare('SELECT * FROM tasks WHERE completedAt >= ? AND status = ?').all(todayStr, 'done').map(rowToTask);
}

export function getRecentTasks(limit: number): Task[] {
  return db.prepare('SELECT * FROM tasks ORDER BY updatedAt DESC LIMIT ?').all(limit).map(rowToTask);
}

export function getTokenUsageToday(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString();
  const row = db.prepare('SELECT COALESCE(SUM(tokenUsage), 0) as total FROM tasks WHERE completedAt >= ?').get(todayStr) as any;
  return row?.total ?? 0;
}

export function reorderTasks(items: { id: string; order: number }[]): void {
  const txn = db.transaction(() => {
    for (const item of items) {
      stmtUpdateOrder.run(item.order, item.id);
    }
  });
  txn();
}
