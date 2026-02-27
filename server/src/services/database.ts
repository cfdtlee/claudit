import path from 'path';
import os from 'os';
import fs from 'fs';
import Database from 'better-sqlite3';

const DATA_DIR = path.join(os.homedir(), '.claudit');
const DB_PATH = path.join(DATA_DIR, 'claudit.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for concurrent read/write (MCP + Web server)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---

db.exec(`
  CREATE TABLE IF NOT EXISTS _meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

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

// --- Migration from legacy JSON files in ~/.claude/ ---

function migrateIfNeeded() {
  const migrated = db.prepare("SELECT value FROM _meta WHERE key = 'json_migrated'").get() as { value: string } | undefined;
  if (migrated) return;

  const claudeDir = path.join(os.homedir(), '.claude');

  migrateTodos(claudeDir);
  migrateCronTasks(claudeDir);
  migrateCronExecutions(claudeDir);
  migrateProviderConfigs(claudeDir);
  migrateManagedSessions(claudeDir);

  db.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES ('json_migrated', ?)").run(new Date().toISOString());
}

function readAndBackup(filePath: string): unknown | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    fs.renameSync(filePath, filePath + '.bak');
    return data;
  } catch {
    return null;
  }
}

function migrateTodos(claudeDir: string) {
  const data = readAndBackup(path.join(claudeDir, 'claudit-todos.json')) as any[] | null;
  if (!data?.length) return;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO todos (id, title, description, completed, priority, sessionId, sessionLabel, createdAt, completedAt,
      providerId, configId, externalId, externalUrl, lastSyncedAt, syncStatus, syncError)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const t of data) {
      const p = t.provider;
      stmt.run(
        t.id, t.title, t.description ?? null, t.completed ? 1 : 0, t.priority ?? 'medium',
        t.sessionId ?? null, t.sessionLabel ?? null, t.createdAt, t.completedAt ?? null,
        p?.providerId ?? null, p?.configId ?? null, p?.externalId ?? null,
        p?.externalUrl ?? null, p?.lastSyncedAt ?? null, p?.syncStatus ?? null, p?.syncError ?? null
      );
    }
  });
  tx();
}

function migrateCronTasks(claudeDir: string) {
  const data = readAndBackup(path.join(claudeDir, 'cron-tasks.json')) as any[] | null;
  if (!data?.length) return;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO cron_tasks (id, name, cronExpression, prompt, enabled, projectPath, lastRun, nextRun, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const t of data) {
      stmt.run(t.id, t.name, t.cronExpression, t.prompt, t.enabled ? 1 : 0,
        t.projectPath ?? null, t.lastRun ?? null, t.nextRun ?? null, t.createdAt);
    }
  });
  tx();
}

function migrateCronExecutions(claudeDir: string) {
  const data = readAndBackup(path.join(claudeDir, 'cron-executions.json')) as any[] | null;
  if (!data?.length) return;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO cron_executions (id, taskId, startedAt, finishedAt, status, output, error)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const e of data) {
      stmt.run(e.id, e.taskId, e.startedAt, e.finishedAt ?? null, e.status, e.output ?? null, e.error ?? null);
    }
  });
  tx();
}

function migrateProviderConfigs(claudeDir: string) {
  const data = readAndBackup(path.join(claudeDir, 'claudit-todo-providers.json')) as any[] | null;
  if (!data?.length) return;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO provider_configs (id, providerId, name, enabled, config, syncIntervalMinutes, lastSyncAt, lastSyncError, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const c of data) {
      stmt.run(c.id, c.providerId, c.name, c.enabled ? 1 : 0,
        JSON.stringify(c.config ?? {}), c.syncIntervalMinutes ?? null,
        c.lastSyncAt ?? null, c.lastSyncError ?? null, c.createdAt);
    }
  });
  tx();
}

function migrateManagedSessions(claudeDir: string) {
  const filePath = path.join(claudeDir, 'claudit-sessions.json');
  const raw = readAndBackup(filePath) as { sessions?: any[] } | null;
  const data = raw?.sessions;
  if (!data?.length) return;

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO managed_sessions (sessionId, projectPath, displayName, archived, pinned, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const s of data) {
      stmt.run(s.sessionId, s.projectPath ?? '', s.displayName ?? null,
        s.archived ? 1 : 0, s.pinned ? 1 : 0, s.createdAt);
    }
  });
  tx();
}

// Run migration on startup
migrateIfNeeded();

export { db };
export function closeDb() {
  db.close();
}
