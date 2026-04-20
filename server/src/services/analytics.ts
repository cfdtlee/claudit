import crypto from 'crypto';
import { db } from './database.js';

// --- Helpers ---

export function hashId(id: string): string {
  return crypto.createHash('sha256').update(id).digest('hex').substring(0, 8);
}

// --- Track ---

const insertStmt = db.prepare(
  `INSERT INTO events (event, props, timestamp) VALUES (?, ?, datetime('now'))`
);

export function track(event: string, props?: Record<string, any>): void {
  try {
    insertStmt.run(event, JSON.stringify(props ?? {}));
  } catch (err: any) {
    console.error(`[analytics] track error: ${err.message}`);
  }
}

// --- Query ---

export interface EventFilter {
  event?: string;
  limit?: number;
  offset?: number;
  since?: string; // ISO datetime
}

export function getEvents(filters?: EventFilter) {
  let sql = 'SELECT id, event, props, timestamp FROM events WHERE 1=1';
  const params: any[] = [];

  if (filters?.event) {
    sql += ' AND event = ?';
    params.push(filters.event);
  }
  if (filters?.since) {
    sql += ' AND timestamp >= ?';
    params.push(filters.since);
  }

  sql += ' ORDER BY id DESC';

  const limit = Math.min(filters?.limit ?? 100, 1000);
  sql += ' LIMIT ?';
  params.push(limit);

  if (filters?.offset) {
    sql += ' OFFSET ?';
    params.push(filters.offset);
  }

  return db.prepare(sql).all(...params);
}

// --- Stats ---

export function getStats() {
  const today = new Date().toISOString().slice(0, 10);

  const totalEvents = (db.prepare(
    `SELECT COUNT(*) as count FROM events`
  ).get() as any).count;

  const todayEvents = (db.prepare(
    `SELECT COUNT(*) as count FROM events WHERE timestamp >= ?`
  ).get(today) as any).count;

  const eventCounts = db.prepare(
    `SELECT event, COUNT(*) as count FROM events WHERE timestamp >= ? GROUP BY event ORDER BY count DESC`
  ).all(today) as { event: string; count: number }[];

  // Messages today
  const messagesToday = (db.prepare(
    `SELECT COUNT(*) as count FROM events WHERE event = 'ws_chat_message' AND timestamp >= ?`
  ).get(today) as any).count;

  // Average response duration today
  const avgResponse = db.prepare(
    `SELECT AVG(json_extract(props, '$.duration_ms')) as avg_ms FROM events WHERE event = 'ws_chat_response' AND timestamp >= ?`
  ).get(today) as any;

  // Error-like events today
  const errorEvents = (db.prepare(
    `SELECT COUNT(*) as count FROM events WHERE (event LIKE '%error%' OR event LIKE '%fail%' OR event = 'pty_exit') AND timestamp >= ?`
  ).get(today) as any).count;

  // Unique sessions today (from hashed session IDs in props)
  const uniqueSessions = (db.prepare(
    `SELECT COUNT(DISTINCT json_extract(props, '$.session_hash')) as count FROM events WHERE json_extract(props, '$.session_hash') IS NOT NULL AND timestamp >= ?`
  ).get(today) as any).count;

  return {
    totalEvents,
    todayEvents,
    eventCounts,
    messagesToday,
    avgResponseMs: avgResponse?.avg_ms ?? null,
    errorEventsToday: errorEvents,
    uniqueSessionsToday: uniqueSessions,
  };
}

// --- Cleanup ---

export function cleanupOldEvents(days = 30): number {
  const result = db.prepare(
    `DELETE FROM events WHERE timestamp < datetime('now', ?)`
  ).run(`-${days} days`);
  return result.changes;
}

// Run cleanup on module load and then daily
cleanupOldEvents();
setInterval(() => cleanupOldEvents(), 24 * 60 * 60 * 1000);
