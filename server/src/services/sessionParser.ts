import fs from 'fs';
import path from 'path';
import os from 'os';
import { ContentBlock, ParsedMessage, SessionDetail } from '../types.js';

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

interface RawRecord {
  type: string;
  uuid?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  slug?: string;
  isMeta?: boolean;
  userType?: string;
  message?: {
    role?: string;
    id?: string;
    model?: string;
    content?: any; // Can be string, array, or object
  };
}

/** Normalize message content to ContentBlock[] */
function normalizeContent(raw: any): ContentBlock[] {
  if (!raw) return [];
  if (typeof raw === 'string') {
    return [{ type: 'text', text: raw }];
  }
  if (Array.isArray(raw)) {
    return raw;
  }
  return [{ type: 'text', text: JSON.stringify(raw) }];
}

/** Check if a user message is just tool_result (internal exchange, not user-typed) */
function isToolResultOnly(content: ContentBlock[]): boolean {
  return content.length > 0 && content.every(c => c.type === 'tool_result');
}

export function parseSession(projectHash: string, sessionId: string): SessionDetail {
  const filePath = path.join(PROJECTS_DIR, projectHash, `${sessionId}.jsonl`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Session file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // We need to merge assistant records with the same message.id
  const messagesById = new Map<string, ParsedMessage>();
  const orderedMessages: ParsedMessage[] = [];
  let projectPath = projectHash;
  let slug: string | undefined;

  for (const line of lines) {
    if (!line.trim()) continue;

    let record: RawRecord;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    // Capture project path from first record with cwd
    if (record.cwd && projectPath === projectHash) {
      projectPath = record.cwd;
    }

    // Capture slug
    if (record.slug && !slug) {
      slug = record.slug;
    }

    // Skip non-message records
    if (record.type !== 'user' && record.type !== 'assistant') continue;
    if (record.isMeta) continue;
    if (!record.message?.content) continue;

    const normalizedContent = normalizeContent(record.message.content);

    if (record.type === 'user') {
      // Skip pure tool_result messages (internal tool exchange)
      if (isToolResultOnly(normalizedContent)) continue;

      // Only keep user messages that have actual text content
      const hasText = normalizedContent.some(c => c.type === 'text' && c.text?.trim());
      if (!hasText) continue;

      const msg: ParsedMessage = {
        uuid: record.uuid || crypto.randomUUID(),
        role: 'user',
        timestamp: record.timestamp || new Date().toISOString(),
        content: normalizedContent.filter(c => c.type === 'text'),
      };
      orderedMessages.push(msg);
    } else if (record.type === 'assistant') {
      const msgId = record.message.id;
      if (!msgId) continue;

      const existing = messagesById.get(msgId);
      if (existing) {
        // Merge: use latest (most complete) content
        existing.content = normalizedContent;
      } else {
        const msg: ParsedMessage = {
          uuid: record.uuid || crypto.randomUUID(),
          role: 'assistant',
          timestamp: record.timestamp || new Date().toISOString(),
          content: normalizedContent,
          model: record.message.model,
          messageId: msgId,
        };
        messagesById.set(msgId, msg);
        orderedMessages.push(msg);
      }
    }
  }

  return {
    sessionId,
    projectPath,
    messages: orderedMessages,
    slug,
  };
}
