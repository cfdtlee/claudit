import path from 'path';
import os from 'os';
import fs from 'fs';
import Database from 'better-sqlite3';

const DATA_DIR = path.join(os.homedir(), '.claudit');
const DB_PATH = path.join(DATA_DIR, 'claudit.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for concurrent read/write (MCP + Web server)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
    completedAt   TEXT,
    -- provider fields (NULL when no provider)
    providerId    TEXT,
    configId      TEXT,
    externalId    TEXT,
    externalUrl   TEXT,
    lastSyncedAt  TEXT,
    syncStatus    TEXT,
    syncError     TEXT
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

  CREATE TABLE IF NOT EXISTS provider_configs (
    id                  TEXT PRIMARY KEY,
    providerId          TEXT NOT NULL,
    name                TEXT NOT NULL,
    enabled             INTEGER NOT NULL DEFAULT 1,
    config              TEXT NOT NULL DEFAULT '{}',
    syncIntervalMinutes INTEGER,
    lastSyncAt          TEXT,
    lastSyncError       TEXT,
    createdAt           TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS managed_sessions (
    sessionId   TEXT PRIMARY KEY,
    projectPath TEXT NOT NULL DEFAULT '',
    displayName TEXT,
    archived    INTEGER NOT NULL DEFAULT 0,
    pinned      INTEGER NOT NULL DEFAULT 0,
    createdAt   TEXT NOT NULL
  );
`);

export { db };
export function closeDb() {
  db.close();
}
