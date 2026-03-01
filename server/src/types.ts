// Re-export shared types
export type {
  SessionSummary,
  ProjectGroup,
  ContentBlock,
  ParsedMessage,
  SessionDetail,
  MergedSessionDetail,
  CronTask,
  CronExecution,
  TodoGroup,
  TodoItem,
} from '../../shared/src/types.js';

// Server-only types

export interface HistoryEntry {
  display: string;
  pastedContents: Record<string, unknown>;
  timestamp: number;
  project: string;
  sessionId: string;
}
