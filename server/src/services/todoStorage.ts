import crypto from 'crypto';
import { TodoItem, TodoProviderOrigin } from '../types.js';
import { db } from './database.js';

// --- Prepared statements ---

const stmtAll = db.prepare('SELECT * FROM todos');
const stmtById = db.prepare('SELECT * FROM todos WHERE id = ?');
const stmtInsert = db.prepare(`
  INSERT INTO todos (id, title, description, completed, priority, sessionId, sessionLabel, createdAt, completedAt,
    providerId, configId, externalId, externalUrl, lastSyncedAt, syncStatus, syncError)
  VALUES (@id, @title, @description, @completed, @priority, @sessionId, @sessionLabel, @createdAt, @completedAt,
    @providerId, @configId, @externalId, @externalUrl, @lastSyncedAt, @syncStatus, @syncError)
`);
const stmtDelete = db.prepare('DELETE FROM todos WHERE id = ?');

function rowToTodo(row: any): TodoItem {
  const todo: TodoItem = {
    id: row.id,
    title: row.title,
    completed: row.completed === 1,
    priority: row.priority,
    createdAt: row.createdAt,
  };
  if (row.description != null) todo.description = row.description;
  if (row.sessionId != null) todo.sessionId = row.sessionId;
  if (row.sessionLabel != null) todo.sessionLabel = row.sessionLabel;
  if (row.completedAt != null) todo.completedAt = row.completedAt;
  if (row.providerId != null) {
    todo.provider = {
      providerId: row.providerId,
      configId: row.configId,
      externalId: row.externalId,
      externalUrl: row.externalUrl,
      lastSyncedAt: row.lastSyncedAt,
      syncStatus: row.syncStatus,
      syncError: row.syncError,
    } as TodoProviderOrigin;
  }
  return todo;
}

function todoToParams(todo: TodoItem) {
  const p = todo.provider;
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description ?? null,
    completed: todo.completed ? 1 : 0,
    priority: todo.priority,
    sessionId: todo.sessionId ?? null,
    sessionLabel: todo.sessionLabel ?? null,
    createdAt: todo.createdAt,
    completedAt: todo.completedAt ?? null,
    providerId: p?.providerId ?? null,
    configId: p?.configId ?? null,
    externalId: p?.externalId ?? null,
    externalUrl: p?.externalUrl ?? null,
    lastSyncedAt: p?.lastSyncedAt ?? null,
    syncStatus: p?.syncStatus ?? null,
    syncError: p?.syncError ?? null,
  };
}

export function getAllTodos(): TodoItem[] {
  return stmtAll.all().map(rowToTodo);
}

export function getTodo(id: string): TodoItem | undefined {
  const row = stmtById.get(id);
  return row ? rowToTodo(row) : undefined;
}

export function createTodo(data: Omit<TodoItem, 'id' | 'createdAt'>): TodoItem {
  const todo: TodoItem = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  stmtInsert.run(todoToParams(todo));
  return todo;
}

export function updateTodo(id: string, updates: Partial<TodoItem>): TodoItem | null {
  const existing = getTodo(id);
  if (!existing) return null;
  const merged: TodoItem = { ...existing, ...updates, id };
  // Delete and re-insert (simple, keeps same prepared stmt)
  stmtDelete.run(id);
  stmtInsert.run(todoToParams(merged));
  return merged;
}

export function deleteTodo(id: string): boolean {
  const result = stmtDelete.run(id);
  return result.changes > 0;
}
