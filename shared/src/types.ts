// --- History Index Types ---

export interface SessionSummary {
  sessionId: string;
  projectPath: string;
  projectHash: string;
  lastMessage: string;
  timestamp: number;
  messageCount: number;
  displayName?: string;
  status: 'idle' | 'running' | 'need_attention';
  pinned?: boolean;
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

// --- Todo Group Types ---

export interface TodoGroup {
  id: string;
  name: string;
  position: number;
  createdAt: string;
}

// --- Todo Types ---

export interface TodoItem {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  sessionId?: string;
  sessionLabel?: string;
  groupId?: string;
  position: number;
  createdAt: string;
  completedAt?: string;
}
