// --- History Index Types ---

export interface SessionSummary {
  sessionId: string;
  projectPath: string;
  projectHash: string;
  lastMessage: string;
  timestamp: number;
  messageCount: number;
  displayName?: string;
  status: 'idle' | 'running' | 'done';
  pinned?: boolean;
  isMayor?: boolean;
  slug?: string;
  slugPartCount?: number;
  slugSessionIds?: string[];
}

export interface ProjectGroup {
  projectPath: string;
  projectHash: string;
  sessions: SessionSummary[];
}

// --- Session Parser Types ---

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  thinking?: string;
}

export interface ParsedMessage {
  uuid: string;
  role: 'user' | 'assistant';
  timestamp: string;
  content: ContentBlock[];
  model?: string;
  messageId?: string;
}

export interface SessionDetail {
  sessionId: string;
  projectPath: string;
  messages: ParsedMessage[];
  slug?: string;
}

export interface MergedSessionDetail {
  slug: string;
  projectPath: string;
  sessionIds: string[];
  latestSessionId: string;
  messages: ParsedMessage[];
  sessionBoundaries: number[];
}

// --- Cron Task Types ---

export interface CronTask {
  id: string;
  name: string;
  cronExpression: string;
  prompt: string;
  enabled: boolean;
  projectPath?: string;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

export interface CronExecution {
  id: string;
  taskId: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'success' | 'error';
  output?: string;
  error?: string;
  sessionId?: string;
}

// --- Task Group Types (formerly Todo Groups) ---

export interface TaskGroup {
  id: string;
  name: string;
  position: number;
  createdAt: string;
}

// --- Agent Types ---

export interface Agent {
  id: string;
  name: string;
  avatar?: string;
  specialty?: string;
  systemPrompt: string;
  recentSummary?: string;
  isSystem?: boolean;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
}

// --- Project Types ---

export interface Project {
  id: string;
  name: string;
  description?: string;
  repoPath: string;
  branch?: string;
  defaultAgentId?: string;
  defaultModel?: string;
  defaultPermissionMode?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Task Types ---

export type TaskStatus = 'pending' | 'running' | 'waiting' | 'draft' | 'paused' | 'done' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  title: string;
  description?: string;
  prompt?: string;
  status: TaskStatus;
  created_by: string;
  errorMessage?: string;
  order: number;
  priority?: number;
  parent_id?: string;
  discovered_from?: string;
  blocked_by?: string[];
  assignee?: string;
  projectId?: string;
  groupId?: string;
  sessionId?: string;
  sessionLabel?: string;
  worktreeId?: string;
  branch?: string;
  prUrl?: string;
  workingDir?: string;
  model?: string;
  permissionMode?: string;
  retryCount: number;
  maxRetries?: number;
  timeoutMs?: number;
  taskType?: string;
  resultSummary?: string;
  resultPath?: string;
  filesChanged?: string[];
  diffSummary?: string;
  tokenUsage?: number;
  completionMode?: string;
  acceptanceCriteria?: string;
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  dueDate?: string;
}

// --- Task Session Types ---

export interface Checkpoint {
  step: string;
  timestamp: string;
  output?: string;
}

export interface TaskSession {
  id: string;
  taskId: string;
  sessionId: string;
  agentId?: string;
  startedAt: string;
  endedAt?: string;
  resultSummary?: string;
  resultPath?: string;
  tokenUsage?: number;
  checkpoints?: Checkpoint[];
}

// --- Mayor Message Types ---

export interface MayorMessage {
  id: string;
  type: 'event' | 'human' | 'notification' | 'witness';
  source: string;
  subject?: string;
  body: string;
  read: boolean;
  createdAt: string;
}

// --- Settings Types ---

export interface ClauditConfig {
  defaultModel?: string;
  defaultPermissionMode?: string;
  workingDirectory?: string;
  notifyOnWaiting?: boolean;
  notifyOnDone?: boolean;
  notifyOnFailed?: boolean;
  notifyOnStuck?: boolean;
  mayorSessionId?: string;
  mayorAutoExecute?: boolean;
  workerEnabled?: boolean;
  maxConcurrentWorkers?: number;
  sessionTimeoutMs?: number;
  witnessIntervalMs?: number;
  patrolIntervalMs?: number;
}

// --- Dashboard Types ---

export interface DashboardData {
  running: number;
  waiting: number;
  doneToday: number;
  failed: number;
  tokenUsageToday: number;
  recentTasks: Task[];
  activeAgents: {
    agent: Agent;
    runningSessions: number;
    waitingSessions: number;
  }[];
  systemStatus: {
    mayorOnline: boolean;
    mayorSessionId?: string;
    mayorProjectPath?: string;
    witnessRunning: boolean;
    witnessLastCheck: string;
  };
}
