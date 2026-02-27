import { db } from './database.js';

export interface ManagedSession {
  sessionId: string;
  projectPath: string;
  displayName?: string;
  archived?: boolean;
  pinned?: boolean;
  createdAt: string;
}

// --- Prepared statements ---

const stmtAll = db.prepare('SELECT * FROM managed_sessions');
const stmtById = db.prepare('SELECT * FROM managed_sessions WHERE sessionId = ?');
const stmtInsert = db.prepare(`
  INSERT INTO managed_sessions (sessionId, projectPath, displayName, archived, pinned, createdAt)
  VALUES (@sessionId, @projectPath, @displayName, @archived, @pinned, @createdAt)
`);
const stmtDelete = db.prepare('DELETE FROM managed_sessions WHERE sessionId = ?');
const stmtUpsertArchive = db.prepare(`
  INSERT INTO managed_sessions (sessionId, projectPath, displayName, archived, pinned, createdAt)
  VALUES (@sessionId, '', NULL, @archived, 0, @createdAt)
  ON CONFLICT(sessionId) DO UPDATE SET archived = @archived
`);
const stmtUpsertPin = db.prepare(`
  INSERT INTO managed_sessions (sessionId, projectPath, displayName, archived, pinned, createdAt)
  VALUES (@sessionId, '', NULL, 0, @pinned, @createdAt)
  ON CONFLICT(sessionId) DO UPDATE SET pinned = @pinned
`);
const stmtRename = db.prepare('UPDATE managed_sessions SET displayName = ? WHERE sessionId = ?');
const stmtPinned = db.prepare('SELECT sessionId FROM managed_sessions WHERE pinned = 1');
const stmtArchived = db.prepare('SELECT sessionId FROM managed_sessions WHERE archived = 1');

// --- Row mapper ---

function rowToSession(row: any): ManagedSession {
  const s: ManagedSession = {
    sessionId: row.sessionId,
    projectPath: row.projectPath,
    createdAt: row.createdAt,
  };
  if (row.displayName != null) s.displayName = row.displayName;
  if (row.archived === 1) s.archived = true;
  if (row.pinned === 1) s.pinned = true;
  return s;
}

export function getManagedSessions(): ManagedSession[] {
  return stmtAll.all().map(rowToSession);
}

export function addManagedSession(sessionId: string, projectPath: string): ManagedSession {
  const entry: ManagedSession = {
    sessionId,
    projectPath,
    createdAt: new Date().toISOString(),
  };
  stmtInsert.run({
    sessionId,
    projectPath,
    displayName: null,
    archived: 0,
    pinned: 0,
    createdAt: entry.createdAt,
  });
  return entry;
}

export function renameManagedSession(sessionId: string, name: string): ManagedSession | null {
  const result = stmtRename.run(name, sessionId);
  if (result.changes === 0) return null;
  const row = stmtById.get(sessionId);
  return row ? rowToSession(row) : null;
}

export function archiveManagedSession(sessionId: string, archived: boolean): void {
  stmtUpsertArchive.run({
    sessionId,
    archived: archived ? 1 : 0,
    createdAt: new Date().toISOString(),
  });
}

export function removeManagedSession(sessionId: string): void {
  stmtDelete.run(sessionId);
}

export function pinManagedSession(sessionId: string, pinned: boolean): void {
  stmtUpsertPin.run({
    sessionId,
    pinned: pinned ? 1 : 0,
    createdAt: new Date().toISOString(),
  });
}

export function getPinnedSessionIds(): Set<string> {
  const rows = stmtPinned.all() as { sessionId: string }[];
  return new Set(rows.map(r => r.sessionId));
}

export function getArchivedSessionIds(): Set<string> {
  const rows = stmtArchived.all() as { sessionId: string }[];
  return new Set(rows.map(r => r.sessionId));
}

/** Returns Map<sessionId, ManagedSession> for fast lookup */
export function getManagedSessionMap(): Map<string, ManagedSession> {
  const map = new Map<string, ManagedSession>();
  for (const s of getManagedSessions()) {
    map.set(s.sessionId, s);
  }
  return map;
}
