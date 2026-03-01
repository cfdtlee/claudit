import path from 'path';
import os from 'os';
import fs from 'fs';
import Database from 'better-sqlite3';

const DATA_DIR = path.join(os.homedir(), '.claudit');
const DB_NAME = process.env.NODE_ENV === 'development' ? 'claudit-dev.db' : 'claudit.db';
const DB_PATH = path.join(DATA_DIR, DB_NAME);

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for concurrent read/write (MCP + Web server)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// --- Schema ---

db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    description   TEXT,
    completed     INTEGER NOT NULL DEFAULT 0,
    priority      TEXT NOT NULL DEFAULT 'medium',
    sessionId     TEXT,
    sessionLabel  TEXT,
    createdAt     TEXT NOT NULL,
    completedAt   TEXT
  );

  CREATE TABLE IF NOT EXISTS cron_tasks (
    id             TEXT PRIMARY KEY,
    name           TEXT NOT NULL,
    cronExpression TEXT NOT NULL,
    prompt         TEXT NOT NULL,
    enabled        INTEGER NOT NULL DEFAULT 1,
    projectPath    TEXT,
    lastRun        TEXT,
    nextRun        TEXT,
    createdAt      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cron_executions (
    id         TEXT PRIMARY KEY,
    taskId     TEXT NOT NULL REFERENCES cron_tasks(id) ON DELETE CASCADE,
    startedAt  TEXT NOT NULL,
    finishedAt TEXT,
    status     TEXT NOT NULL DEFAULT 'running',
    output     TEXT,
    error      TEXT
  );

  CREATE TABLE IF NOT EXISTS managed_sessions (
    sessionId   TEXT PRIMARY KEY,
    projectPath TEXT NOT NULL DEFAULT '',
    displayName TEXT,
    archived    INTEGER NOT NULL DEFAULT 0,
    pinned      INTEGER NOT NULL DEFAULT 0,
    createdAt   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS todo_groups (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    position  INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );
`);

// --- Indexes ---
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_todos_groupId ON todos(groupId);
  CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
  CREATE INDEX IF NOT EXISTS idx_cron_executions_taskId_startedAt ON cron_executions(taskId, startedAt DESC);
  CREATE INDEX IF NOT EXISTS idx_managed_sessions_archived ON managed_sessions(archived);
  CREATE INDEX IF NOT EXISTS idx_managed_sessions_pinned ON managed_sessions(pinned);
`);

// Idempotent ALTER TABLE helper: only swallow "duplicate column" errors
function addColumnIfNotExists(sql: string) {
  try { db.exec(sql); } catch (e: any) {
    if (!e.message?.includes('duplicate column')) throw e;
  }
}

addColumnIfNotExists('ALTER TABLE todos ADD COLUMN groupId TEXT REFERENCES todo_groups(id) ON DELETE SET NULL');
addColumnIfNotExists('ALTER TABLE todos ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
addColumnIfNotExists('ALTER TABLE cron_executions ADD COLUMN sessionId TEXT');

export { db };
export function closeDb() {
  db.close();
}
