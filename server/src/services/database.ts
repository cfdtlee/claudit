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

// --- Migrations ---

type Migration = (db: Database.Database) => void;

const migrations: Migration[] = [
  // v0 → v1: baseline (consolidates current schema including all ALTER TABLE columns)
  (db) => {
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
        groupId       TEXT REFERENCES todo_groups(id) ON DELETE SET NULL,
        position      INTEGER NOT NULL DEFAULT 0
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
        error      TEXT,
        sessionId  TEXT
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

      CREATE INDEX IF NOT EXISTS idx_todos_groupId ON todos(groupId);
      CREATE INDEX IF NOT EXISTS idx_todos_completed ON todos(completed);
      CREATE INDEX IF NOT EXISTS idx_cron_executions_taskId_startedAt ON cron_executions(taskId, startedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_managed_sessions_archived ON managed_sessions(archived);
      CREATE INDEX IF NOT EXISTS idx_managed_sessions_pinned ON managed_sessions(pinned);
    `);
  },
  // v1 → v2: agents, projects, tasks, task_sessions, settings
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT,
        specialty TEXT,
        systemPrompt TEXT NOT NULL DEFAULT '',
        recentSummary TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        lastActiveAt TEXT
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        repoPath TEXT NOT NULL,
        branch TEXT,
        defaultAgentId TEXT REFERENCES agents(id) ON DELETE SET NULL,
        defaultModel TEXT,
        defaultPermissionMode TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        prompt TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_by TEXT NOT NULL DEFAULT 'human',
        errorMessage TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        priority INTEGER,
        parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        discovered_from TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        blocked_by TEXT,
        assignee TEXT REFERENCES agents(id) ON DELETE SET NULL,
        projectId TEXT REFERENCES projects(id) ON DELETE SET NULL,
        sessionId TEXT,
        worktreeId TEXT,
        branch TEXT,
        prUrl TEXT,
        workingDir TEXT,
        model TEXT,
        permissionMode TEXT,
        retryCount INTEGER NOT NULL DEFAULT 0,
        maxRetries INTEGER,
        timeoutMs INTEGER,
        taskType TEXT,
        resultSummary TEXT,
        resultPath TEXT,
        filesChanged TEXT,
        diffSummary TEXT,
        tokenUsage INTEGER,
        completionMode TEXT DEFAULT 'declared',
        acceptanceCriteria TEXT,
        tags TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        startedAt TEXT,
        completedAt TEXT,
        dueDate TEXT
      );

      CREATE TABLE IF NOT EXISTS task_sessions (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        sessionId TEXT NOT NULL,
        agentId TEXT REFERENCES agents(id) ON DELETE SET NULL,
        startedAt TEXT NOT NULL,
        endedAt TEXT,
        resultSummary TEXT,
        resultPath TEXT,
        tokenUsage INTEGER
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_projectId ON tasks(projectId);
      CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
      CREATE INDEX IF NOT EXISTS idx_task_sessions_taskId ON task_sessions(taskId);
    `);
  },
  // v2 → v3: task_sessions checkpoints column
  (db) => {
    db.exec(`
      ALTER TABLE task_sessions ADD COLUMN checkpoints TEXT;
    `);
  },
  // v3 → v4: merge Todo into Task — add todo-specific columns, migrate data, drop todos table
  (db) => {
    // Add new columns to tasks
    db.exec(`
      ALTER TABLE tasks ADD COLUMN description TEXT;
      ALTER TABLE tasks ADD COLUMN groupId TEXT REFERENCES todo_groups(id) ON DELETE SET NULL;
      ALTER TABLE tasks ADD COLUMN sessionLabel TEXT;
      CREATE INDEX IF NOT EXISTS idx_tasks_groupId ON tasks(groupId);
    `);

    // Migrate existing todos into tasks
    const priorityMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
    const todos = db.prepare('SELECT * FROM todos').all() as any[];
    const insertTask = db.prepare(`
      INSERT INTO tasks (
        id, title, description, prompt, status, created_by, "order", priority,
        groupId, sessionId, sessionLabel, retryCount,
        createdAt, updatedAt, completedAt
      ) VALUES (
        @id, @title, @description, @prompt, @status, @created_by, @order, @priority,
        @groupId, @sessionId, @sessionLabel, @retryCount,
        @createdAt, @updatedAt, @completedAt
      )
    `);
    for (const todo of todos) {
      insertTask.run({
        id: todo.id,
        title: todo.title,
        description: todo.description ?? null,
        prompt: null,
        status: todo.completed === 1 ? 'done' : 'pending',
        created_by: 'human',
        order: todo.position ?? 0,
        priority: priorityMap[todo.priority] ?? 2,
        groupId: todo.groupId ?? null,
        sessionId: todo.sessionId ?? null,
        sessionLabel: todo.sessionLabel ?? null,
        retryCount: 0,
        createdAt: todo.createdAt,
        updatedAt: todo.createdAt,
        completedAt: todo.completedAt ?? null,
      });
    }

    // Drop the todos table (groups table kept for task grouping)
    db.exec('DROP TABLE IF EXISTS todos;');
  },
];

function runMigrations() {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;
  for (let i = currentVersion; i < migrations.length; i++) {
    db.transaction(() => {
      migrations[i](db);
      db.pragma(`user_version = ${i + 1}`);
    })();
    console.log(`[db] migration ${i} → ${i + 1} applied`);
  }
}

runMigrations();

export { db };
export function closeDb() {
  db.close();
}
