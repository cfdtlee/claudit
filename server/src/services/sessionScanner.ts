import fs from 'fs';
import path from 'path';
import os from 'os';
import { HistoryEntry, SessionSummary } from '../types.js';
import { getManagedSessionMap } from './managedSessions.js';
import { getSessionCache, setSessionCache, isSessionStale, CachedSessionData } from './sessionIndexCache.js';

export const CLAUDE_DIR = path.join(os.homedir(), '.claude');
export const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
export const HISTORY_FILE = path.join(CLAUDE_DIR, 'history.jsonl');

/** Build history index from history.jsonl, also builds projectHash -> real path map */
export function readHistoryEntries(): {
  entries: Map<string, HistoryEntry>;
  projectPaths: Map<string, string>;
} {
  const entries = new Map<string, HistoryEntry>();
  const projectPaths = new Map<string, string>();
  if (!fs.existsSync(HISTORY_FILE)) return { entries, projectPaths };

  const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry: HistoryEntry = JSON.parse(line);
      const existing = entries.get(entry.sessionId);
      if (!existing || entry.timestamp > existing.timestamp) {
        entries.set(entry.sessionId, entry);
      }
      if (entry.project) {
        const hash = entry.project.replace(/\//g, '-');
        projectPaths.set(hash, entry.project);
      }
    } catch {
      // skip malformed lines
    }
  }
  return { entries, projectPaths };
}

/** Try to get project path (cwd) from session JSONL file */
export function getProjectPathFromSession(sessionFile: string): string | null {
  try {
    const content = fs.readFileSync(sessionFile, 'utf-8');
    for (const line of content.split('\n').slice(0, 10)) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (record.cwd) return record.cwd;
      } catch {
        // skip malformed
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Try to extract the first user message from a session JSONL file */
export function getFirstUserMessage(sessionFile: string): string | null {
  try {
    const content = fs.readFileSync(sessionFile, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (record.type !== 'user') continue;
        const msg = record.message;
        if (!msg?.content) continue;
        if (typeof msg.content === 'string') return msg.content;
        if (Array.isArray(msg.content)) {
          const hasNonToolResult = msg.content.some(
            (b: any) => b.type === 'text' || (b.type !== 'tool_result')
          );
          if (!hasNonToolResult) continue;
          for (const block of msg.content) {
            if (block.type === 'text' && block.text) return block.text;
          }
        }
      } catch {
        // skip malformed lines
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Quick-count user and assistant type lines in a session file */
export function countMessages(sessionFile: string): number {
  try {
    const content = fs.readFileSync(sessionFile, 'utf-8');
    let count = 0;
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      if (line.includes('"type":"user"') || line.includes('"type":"assistant"')) {
        try {
          const record = JSON.parse(line);
          if (record.type === 'user' || record.type === 'assistant') {
            count++;
          }
        } catch {
          // skip malformed
        }
      }
    }
    return count;
  } catch {
    return 0;
  }
}

export interface LastRecordState {
  type: 'user' | 'assistant' | null;
  isEndTurn: boolean; // assistant with stop_reason "end_turn" and no pending tool_use
}

/** Read tail of file (~4KB) to find last user/assistant record state */
export function getLastRecordState(sessionFile: string): LastRecordState {
  const result: LastRecordState = { type: null, isEndTurn: false };
  try {
    const fd = fs.openSync(sessionFile, 'r');
    const stat = fs.fstatSync(fd);
    const TAIL_SIZE = 4096;
    const start = Math.max(0, stat.size - TAIL_SIZE);
    const buf = Buffer.alloc(Math.min(TAIL_SIZE, stat.size));
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);

    const chunk = buf.toString('utf-8');
    // If we started mid-file, drop the first partial line
    const lines = chunk.split('\n');
    if (start > 0) lines.shift();

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const record = JSON.parse(line);
        if (record.type === 'assistant') {
          result.type = 'assistant';
          const msg = record.message;
          if (msg?.stop_reason === 'end_turn') {
            const hasToolUse = Array.isArray(msg.content) &&
              msg.content.some((b: any) => b.type === 'tool_use');
            result.isEndTurn = !hasToolUse;
          }
          return result;
        }
        if (record.type === 'user') {
          result.type = 'user';
          return result;
        }
      } catch {
        // skip malformed
      }
    }
    return result;
  } catch {
    return result;
  }
}

/** Extract slug from a session JSONL file (first 30 lines) */
export function getSlugFromSession(sessionFile: string): string | null {
  try {
    const content = fs.readFileSync(sessionFile, 'utf-8');
    const lines = content.split('\n').slice(0, 30);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line);
        if (record.slug && typeof record.slug === 'string') {
          return record.slug;
        }
      } catch {
        // skip malformed
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Token usage cache
let tokenCache: { total: number; computedAt: number } | null = null;
const TOKEN_CACHE_TTL = 30_000; // 30s

/** Sum token usage from all session JSONL files modified today */
export function getTokenUsageFromSessions(): number {
  const now = Date.now();
  if (tokenCache && (now - tokenCache.computedAt) < TOKEN_CACHE_TTL) {
    return tokenCache.total;
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const todayIso = todayStart.toISOString();

  let totalTokens = 0;

  if (!fs.existsSync(PROJECTS_DIR)) {
    tokenCache = { total: 0, computedAt: now };
    return 0;
  }

  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;
    const projectDir = path.join(PROJECTS_DIR, dir.name);
    const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      const filePath = path.join(projectDir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < todayMs) continue;

        const content = fs.readFileSync(filePath, 'utf-8');
        const usageByMsgId = new Map<string, { input: number; output: number }>();

        for (const line of content.split('\n')) {
          if (!line.includes('"type":"assistant"')) continue;
          try {
            const record = JSON.parse(line);
            if (record.type !== 'assistant') continue;
            if (record.timestamp && record.timestamp < todayIso) continue;
            const msg = record.message;
            if (!msg?.id || !msg.usage) continue;
            const usage = msg.usage;
            usageByMsgId.set(msg.id, {
              input: (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0),
              output: usage.output_tokens || 0,
            });
          } catch {
            // skip malformed
          }
        }

        for (const u of usageByMsgId.values()) {
          totalTokens += u.input + u.output;
        }
      } catch {
        // skip inaccessible files
      }
    }
  }

  tokenCache = { total: totalTokens, computedAt: now };
  return totalTokens;
}

/** Scan projects directory to find all session files, using mtime-based cache */
export function scanProjectSessions(): SessionSummary[] {
  const summaries: SessionSummary[] = [];
  if (!fs.existsSync(PROJECTS_DIR)) return summaries;

  const { entries: historyEntries, projectPaths } = readHistoryEntries();
  const managedMap = getManagedSessionMap();
  const projectDirs = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });

  const indexCache = getSessionCache();
  const updatedCache: Record<string, CachedSessionData> = { ...indexCache };
  let cacheModified = false;

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;
    const projectHash = dir.name;
    const projectDir = path.join(PROJECTS_DIR, projectHash);

    const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
    let projectPath = projectPaths.get(projectHash) || '';

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      const historyEntry = historyEntries.get(sessionId);
      const filePath = path.join(projectDir, file);

      if (!projectPath && historyEntry?.project) {
        projectPath = historyEntry.project;
      }
      if (!projectPath) {
        projectPath = getProjectPathFromSession(filePath) || projectHash;
      }

      let lastMessage: string;
      let timestamp: number;
      let messageCount: number;
      let lastRecordType: 'user' | 'assistant' | null;
      let lastRecordIsEndTurn = false;
      let lastViewedMtime: number;
      let slug: string | undefined;

      if (!isSessionStale(sessionId, filePath, indexCache)) {
        // Use cached data
        const cached = indexCache[sessionId];
        lastMessage = cached.lastMessage;
        timestamp = cached.timestamp;
        messageCount = cached.messageCount;
        lastRecordType = cached.lastRecordType;
        lastRecordIsEndTurn = cached.lastRecordIsEndTurn ?? false;
        lastViewedMtime = cached.lastViewedMtime ?? cached.fileMtime;
        slug = cached.slug;
        // Backfill slug for old cache entries that didn't have it
        if (slug === undefined && !('slug' in cached)) {
          slug = getSlugFromSession(filePath) || undefined;
          if (slug !== undefined) {
            updatedCache[sessionId] = { ...cached, slug };
            cacheModified = true;
          }
        }
        // Update projectPath from cache if not yet resolved
        if (!projectPath || projectPath === projectHash) {
          projectPath = cached.projectPath;
        }
      } else {
        // Full scan
        if (historyEntry) {
          timestamp = historyEntry.timestamp;
          lastMessage = historyEntry.display;
        } else {
          const stat = fs.statSync(filePath);
          timestamp = stat.mtimeMs;
          lastMessage = getFirstUserMessage(filePath) || sessionId.slice(0, 8) + '...';
        }

        if (lastMessage.length > 100) {
          lastMessage = lastMessage.slice(0, 100) + '...';
        }

        messageCount = countMessages(filePath);
        const lastState = messageCount > 0 ? getLastRecordState(filePath) : { type: null as 'user' | 'assistant' | null, isEndTurn: false };
        lastRecordType = lastState.type;
        lastRecordIsEndTurn = lastState.isEndTurn;

        slug = getSlugFromSession(filePath) || undefined;

        // Preserve lastViewedMtime from old cache entry, or default to current mtime
        const existingCache = indexCache[sessionId];
        try {
          const stat = fs.statSync(filePath);
          lastViewedMtime = existingCache?.lastViewedMtime ?? stat.mtimeMs;
          updatedCache[sessionId] = {
            projectHash,
            projectPath,
            lastMessage,
            timestamp,
            messageCount,
            lastRecordType,
            lastRecordIsEndTurn,
            fileMtime: stat.mtimeMs,
            lastViewedMtime,
            slug,
          };
          cacheModified = true;
        } catch {
          lastViewedMtime = Date.now();
        }
      }

      // Status: mtime-based done/idle
      let status: 'idle' | 'done' = 'idle';
      try {
        const stat = fs.statSync(filePath);
        if (messageCount > 0 && stat.mtimeMs > lastViewedMtime) {
          status = 'done';
        }
      } catch {
        // keep idle
      }

      const managed = managedMap.get(sessionId);

      summaries.push({
        sessionId,
        projectPath,
        projectHash,
        lastMessage,
        timestamp,
        messageCount,
        displayName: managed?.displayName,
        status,
        slug,
      });
    }
  }

  if (cacheModified) {
    setSessionCache(updatedCache);
  }

  return summaries;
}
