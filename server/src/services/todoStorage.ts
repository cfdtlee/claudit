import crypto from 'crypto';
import { TodoItem } from '../types.js';
import { db } from './database.js';

// --- Prepared statements ---

const stmtAll = db.prepare('SELECT * FROM todos ORDER BY position ASC, createdAt ASC');
const stmtById = db.prepare('SELECT * FROM todos WHERE id = ?');
const stmtInsert = db.prepare(`
  INSERT INTO todos (id, title, description, completed, priority, sessionId, sessionLabel, groupId, position, createdAt, completedAt)
  VALUES (@id, @title, @description, @completed, @priority, @sessionId, @sessionLabel, @groupId, @position, @createdAt, @completedAt)
`);
const stmtDelete = db.prepare('DELETE FROM todos WHERE id = ?');
const stmtMaxPosition = db.prepare('SELECT COALESCE(MAX(position), 0) as maxPos FROM todos WHERE groupId IS ?');
const stmtUpdatePositionGroup = db.prepare('UPDATE todos SET position = ?, groupId = ? WHERE id = ?');

function rowToTodo(row: any): TodoItem {
  const todo: TodoItem = {
    id: row.id,
    title: row.title,
    completed: row.completed === 1,
    priority: row.priority,
    position: row.position ?? 0,
    createdAt: row.createdAt,
  };
  if (row.description != null) todo.description = row.description;
  if (row.sessionId != null) todo.sessionId = row.sessionId;
  if (row.sessionLabel != null) todo.sessionLabel = row.sessionLabel;
  if (row.groupId != null) todo.groupId = row.groupId;
  if (row.completedAt != null) todo.completedAt = row.completedAt;
  return todo;
}

function todoToParams(todo: TodoItem) {
  return {
    id: todo.id,
    title: todo.title,
    description: todo.description ?? null,
    completed: todo.completed ? 1 : 0,
    priority: todo.priority,
    sessionId: todo.sessionId ?? null,
    sessionLabel: todo.sessionLabel ?? null,
    groupId: todo.groupId ?? null,
    position: todo.position ?? 0,
    createdAt: todo.createdAt,
    completedAt: todo.completedAt ?? null,
  };
}

export function getNextPosition(groupId?: string): number {
  const row = stmtMaxPosition.get(groupId ?? null) as any;
  return (row?.maxPos ?? 0) + 1000;
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
    position: data.position ?? getNextPosition(data.groupId),
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

export function reorderTodos(items: { id: string; position: number; groupId?: string }[]): void {
  const txn = db.transaction(() => {
    for (const item of items) {
      stmtUpdatePositionGroup.run(item.position, item.groupId ?? null, item.id);
    }
  });
  txn();
}
