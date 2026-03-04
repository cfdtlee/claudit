import crypto from 'crypto';
import { MayorMessage } from '../types.js';
import { db } from './database.js';

const stmtAll = db.prepare('SELECT * FROM mayor_messages ORDER BY createdAt DESC');
const stmtUnread = db.prepare('SELECT * FROM mayor_messages WHERE read = 0 ORDER BY createdAt DESC');
const stmtByType = db.prepare('SELECT * FROM mayor_messages WHERE type = ? ORDER BY createdAt DESC');
const stmtByTypeUnread = db.prepare('SELECT * FROM mayor_messages WHERE type = ? AND read = 0 ORDER BY createdAt DESC');
const stmtById = db.prepare('SELECT * FROM mayor_messages WHERE id = ?');
const stmtInsert = db.prepare(`
  INSERT INTO mayor_messages (id, type, source, subject, body, read, createdAt)
  VALUES (@id, @type, @source, @subject, @body, @read, @createdAt)
`);
const stmtMarkRead = db.prepare('UPDATE mayor_messages SET read = 1 WHERE id = ?');
const stmtMarkAllRead = db.prepare('UPDATE mayor_messages SET read = 1 WHERE read = 0');
const stmtUnreadCount = db.prepare('SELECT COUNT(*) as cnt FROM mayor_messages WHERE read = 0');

function rowToMessage(row: any): MayorMessage {
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    subject: row.subject ?? undefined,
    body: row.body,
    read: row.read === 1,
    createdAt: row.createdAt,
  };
}

export function createMessage(data: {
  type: MayorMessage['type'];
  source: string;
  subject?: string;
  body: string;
}): MayorMessage {
  const now = new Date().toISOString();
  const msg: MayorMessage = {
    id: crypto.randomUUID(),
    type: data.type,
    source: data.source,
    subject: data.subject,
    body: data.body,
    read: false,
    createdAt: now,
  };
  stmtInsert.run({
    id: msg.id,
    type: msg.type,
    source: msg.source,
    subject: msg.subject ?? null,
    body: msg.body,
    read: 0,
    createdAt: msg.createdAt,
  });
  return msg;
}

export function getAllMessages(filters?: { type?: string; unreadOnly?: boolean }): MayorMessage[] {
  if (filters?.type && filters?.unreadOnly) {
    return stmtByTypeUnread.all(filters.type).map(rowToMessage);
  }
  if (filters?.type) {
    return stmtByType.all(filters.type).map(rowToMessage);
  }
  if (filters?.unreadOnly) {
    return stmtUnread.all().map(rowToMessage);
  }
  return stmtAll.all().map(rowToMessage);
}

export function getMessage(id: string): MayorMessage | undefined {
  const row = stmtById.get(id);
  return row ? rowToMessage(row) : undefined;
}

export function markMessageRead(id: string): boolean {
  const result = stmtMarkRead.run(id);
  return result.changes > 0;
}

export function markAllRead(): void {
  stmtMarkAllRead.run();
}

export function getUnreadCount(): number {
  const row = stmtUnreadCount.get() as any;
  return row?.cnt ?? 0;
}
