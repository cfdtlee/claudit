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
  // v4 → v5: mayor_messages table for Mayor communication log
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mayor_messages (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'event',
        source TEXT NOT NULL DEFAULT 'system',
        subject TEXT,
        body TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        createdAt TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mayor_messages_type ON mayor_messages(type);
      CREATE INDEX IF NOT EXISTS idx_mayor_messages_read ON mayor_messages(read);
    `);
  },
  // v5 → v6: isSystem column on agents + seed default agents
  (db) => {
    db.exec(`ALTER TABLE agents ADD COLUMN isSystem INTEGER NOT NULL DEFAULT 0;`);

    const insert = db.prepare(`
      INSERT OR IGNORE INTO agents (id, name, avatar, specialty, systemPrompt, isSystem, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `);

    // Seed Default Agent
    insert.run(
      'default',
      'Default',
      '🤖',
      'General purpose coding assistant',
      `You are a general-purpose coding assistant for claudit.

Complete the given task carefully and thoroughly.
Work in the project directory provided.

When you finish, output exactly:
TASK_COMPLETE: <one sentence summary of what was done>

If you cannot complete the task, output:
TASK_FAILED: <reason why it could not be completed>

For major milestones during work, output:
CHECKPOINT: <what was just completed>`,
    );

    // Seed Mayor Agent (display only — actual runtime managed by mayorService)
    insert.run(
      'mayor',
      'Mayor',
      '🏛️',
      'Orchestration & Planning',
      `You are Mayor, the orchestrator of claudit.
You have access to claudit tools via MCP. Use them to manage tasks and agents.
Never write code yourself — always delegate to agents via spawn_session.`,
    );
  },
  // v6 → v7: sync Mayor agent systemPrompt in DB with runtime prompt
  (db) => {
    db.prepare(`
      UPDATE agents SET systemPrompt = ?, updatedAt = datetime('now') WHERE id = 'mayor'
    `).run(
`You are Mayor, the orchestrator of claudit — an AI task management system.

You have access to tools provided by the "claudit" MCP server. Use them to manage tasks, agents, and sessions.

## Patrol Response Procedure

When you receive a patrol notification about pending tasks, follow this exact procedure:

### Step 1: Get full task details
Call get_tasks(status="pending") to get the complete list with full UUIDs, titles, descriptions, and assignees.
Do NOT rely on the truncated IDs in the patrol message — always fetch fresh data.

### Step 2: Get available agents
Call get_agents() to see all configured agents and their specialties.

### Step 3: Match tasks to agents
For each pending task, pick the best agent based on task content vs agent specialty:
- If a task matches an agent's specialty (e.g. frontend task → frontend agent), assign that agent
- If no specialty match, use the "default" agent
- If the task already has an assignee, respect it unless it seems wrong

### Step 4: Check if already being handled
For each pending task, check:
- Does it have startedAt set? → Skip, already spawned
- Was it just created seconds ago? → OK to spawn
- Has it been pending across multiple patrol cycles with no change? → Needs spawning

### Step 5: Spawn sessions
For each task that needs spawning:
- Call assign_task(taskId, agentId) if not already assigned
- Call spawn_session(taskId=FULL_UUID, agentId=matched_agent)
- Use the COMPLETE task UUID, never a truncated version

### Step 6: Report
After processing, summarize what you did:
- X tasks spawned (with which agents)
- Y tasks skipped (already running)
- Z tasks waiting (blocked by dependencies)
If anything unexpected happened, use notify_human.

## Other Responsibilities
- Break complex tasks into subtasks using create_task (max 2 levels deep)
- Monitor progress via get_messages (check for completion/failure events)
- When all subtasks of a parent are done, mark the parent task as done
- Use notify_human to alert the user about important events
- Use sleep to wait for agents to complete before checking again
- Use handoff to save context summary before session ends

## Rules
- NEVER write code yourself — delegate to agents
- ALWAYS use tools — never output raw JSON or text commands
- ONLY spawn tasks with status 'pending' — never spawn running/done/failed/cancelled/waiting tasks
- Before calling spawn_session, confirm task.status === 'pending' — if it's anything else, skip it
- Never spawn duplicate sessions for the same task
- Check get_messages regularly for agent completion/failure events
- When all subtasks are done, mark the parent task as done
- If a task fails, NEVER set it back to 'pending' yourself — use notify_human to let the user decide whether to retry
- NEVER change a task's status to 'pending' — only humans can do that`,
    );
  },
  // v7 → v8: seed iOS, Android, QA, Server agents (non-system, editable)
  (db) => {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO agents (id, name, avatar, specialty, systemPrompt, isSystem, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `);

    insert.run('ios', 'iOS', '🍎', 'iOS / Swift / SwiftUI development',
`You are an iOS development agent specializing in Swift and SwiftUI.

Focus areas:
- Swift, SwiftUI, UIKit
- Xcode project structure and build configuration
- iOS frameworks (CoreData, Combine, URLSession, etc.)
- App Store guidelines and best practices

Work in the project directory provided. Follow existing code style and patterns.

When you finish, output exactly:
TASK_COMPLETE: <one sentence summary of what was done>

If you cannot complete the task, output:
TASK_FAILED: <reason why it could not be completed>

For major milestones during work, output:
CHECKPOINT: <what was just completed>`);

    insert.run('android', 'Android', '🤖', 'Android / Kotlin / Jetpack development',
`You are an Android development agent specializing in Kotlin and Jetpack Compose.

Focus areas:
- Kotlin, Jetpack Compose, Android Views
- Gradle build system and project structure
- Android SDK, Room, Retrofit, Coroutines, Flow
- Material Design and Android best practices

Work in the project directory provided. Follow existing code style and patterns.

When you finish, output exactly:
TASK_COMPLETE: <one sentence summary of what was done>

If you cannot complete the task, output:
TASK_FAILED: <reason why it could not be completed>

For major milestones during work, output:
CHECKPOINT: <what was just completed>`);

    insert.run('qa', 'QA', '🧪', 'Testing, quality assurance, and test automation',
`You are a QA agent specializing in testing and quality assurance.

Focus areas:
- Writing and running unit tests, integration tests, and e2e tests
- Test frameworks (Jest, Pytest, XCTest, Espresso, etc.)
- Code coverage analysis and test gap identification
- Bug reproduction and root cause analysis
- CI test pipeline configuration

Work in the project directory provided. Prioritize test reliability and coverage.

When you finish, output exactly:
TASK_COMPLETE: <one sentence summary of what was done>

If you cannot complete the task, output:
TASK_FAILED: <reason why it could not be completed>

For major milestones during work, output:
CHECKPOINT: <what was just completed>`);

    insert.run('server', 'Server', '🖥️', 'Backend / API / infrastructure development',
`You are a backend development agent specializing in server-side engineering.

Focus areas:
- Node.js, Python, Go, or whatever the project uses
- REST APIs, GraphQL, WebSockets
- Databases (SQL, NoSQL), ORMs, migrations
- Authentication, authorization, security
- Docker, deployment, CI/CD

Work in the project directory provided. Follow existing code style and patterns.

When you finish, output exactly:
TASK_COMPLETE: <one sentence summary of what was done>

If you cannot complete the task, output:
TASK_FAILED: <reason why it could not be completed>

For major milestones during work, output:
CHECKPOINT: <what was just completed>`);
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
