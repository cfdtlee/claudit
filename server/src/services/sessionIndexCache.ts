import fs from 'fs';
import path from 'path';
import os from 'os';
import { JsonStore } from './jsonStore.js';

export interface CachedSessionData {
  projectHash: string;
  projectPath: string;
  lastMessage: string;
  timestamp: number;
  messageCount: number;
  lastRecordType: 'user' | 'assistant' | null;
  lastRecordIsEndTurn: boolean;
  fileMtime: number;
  lastViewedMtime: number;
  slug?: string;
}

interface IndexData {
  sessions: Record<string, CachedSessionData>; // keyed by sessionId
}

const INDEX_FILE = path.join(os.homedir(), '.claude', 'claudit-index.json');
const indexStore = new JsonStore<IndexData>(INDEX_FILE, { sessions: {} });

export function getSessionCache(): Record<string, CachedSessionData> {
  return indexStore.read().sessions;
}

export function setSessionCache(sessions: Record<string, CachedSessionData>): void {
  indexStore.write({ sessions });
}

export function updateLastViewedMtime(sessionId: string, mtime: number): void {
  const data = indexStore.read();
  const cached = data.sessions[sessionId];
  if (cached) {
    data.sessions[sessionId] = { ...cached, lastViewedMtime: mtime };
    indexStore.write(data);
  }
}

export function isSessionStale(
  sessionId: string,
  filePath: string,
  cache: Record<string, CachedSessionData>,
): boolean {
  const cached = cache[sessionId];
  if (!cached) return true;
  try {
    const stat = fs.statSync(filePath);
    return stat.mtimeMs !== cached.fileMtime;
  } catch {
    return true;
  }
}
