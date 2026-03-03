import { ProjectGroup, SessionSummary } from '../types.js';
import { getManagedSessionMap, getArchivedSessionIds, getPinnedSessionIds } from './managedSessions.js';
import { scanProjectSessions, getLastRecordState } from './sessionScanner.js';
import { getMayorSessionId } from './mayorService.js';
import path from 'path';
import os from 'os';

// Optional: node-pty may not be available
let getActivePtySessions: () => ReadonlySet<string> = () => new Set();
try {
  const ptyMod = await import('./ptyManager.js');
  getActivePtySessions = ptyMod.getActivePtySessions;
} catch {}

let cache: { data: ProjectGroup[]; timestamp: number } | null = null;
const CACHE_TTL = 30_000; // 30 seconds

/** Invalidate the session cache (e.g. after creating a new session) */
export function invalidateSessionCache(): void {
  cache = null;
}

/** Merge sessions that share the same slug within a project */
function mergeBySlug(summaries: SessionSummary[]): SessionSummary[] {
  const slugGroups = new Map<string, SessionSummary[]>();
  const result: SessionSummary[] = [];

  for (const s of summaries) {
    if (!s.slug) {
      result.push(s);
      continue;
    }
    const key = `${s.projectHash}::${s.slug}`;
    let group = slugGroups.get(key);
    if (!group) {
      group = [];
      slugGroups.set(key, group);
    }
    group.push(s);
  }

  for (const group of slugGroups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Sort by timestamp ascending to find earliest and latest
    group.sort((a, b) => a.timestamp - b.timestamp);
    const earliest = group[0];
    const latest = group[group.length - 1];
    const allIds = group.map(s => s.sessionId);

    result.push({
      sessionId: latest.sessionId,
      projectPath: latest.projectPath,
      projectHash: latest.projectHash,
      lastMessage: earliest.lastMessage,
      timestamp: latest.timestamp,
      messageCount: group.reduce((sum, s) => sum + s.messageCount, 0),
      displayName: earliest.displayName || latest.displayName,
      status: latest.status,
      pinned: group.some(s => s.pinned),
      slug: latest.slug,
      slugPartCount: group.length,
      slugSessionIds: allIds,
    });
  }

  return result;
}

/** Get sessions grouped by project, with optional search filter */
export function getSessionIndex(
  query?: string,
  hideEmpty?: boolean,
  managedOnly?: boolean,
  includeArchived?: boolean,
): ProjectGroup[] {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return filterGroups(overlayPinnedStatus(overlayRunningStatus(cache.data)), query, hideEmpty, managedOnly, includeArchived);
  }

  const rawSummaries = scanProjectSessions();
  const summaries = mergeBySlug(rawSummaries);

  // Group by project
  const groupMap = new Map<string, ProjectGroup>();
  for (const s of summaries) {
    let group = groupMap.get(s.projectHash);
    if (!group) {
      group = { projectPath: s.projectPath, projectHash: s.projectHash, sessions: [] };
      groupMap.set(s.projectHash, group);
    }
    group.sessions.push(s);
  }

  // Sort sessions within each group by timestamp desc
  const groups = Array.from(groupMap.values());
  for (const g of groups) {
    g.sessions.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Sort groups by most recent session
  groups.sort((a, b) => {
    const aTime = a.sessions[0]?.timestamp ?? 0;
    const bTime = b.sessions[0]?.timestamp ?? 0;
    return bTime - aTime;
  });

  cache = { data: groups, timestamp: Date.now() };
  return filterGroups(overlayPinnedStatus(overlayRunningStatus(groups)), query, hideEmpty, managedOnly, includeArchived);
}

/** Overlay running/done status from active PTY sessions (not cached) */
function overlayRunningStatus(groups: ProjectGroup[]): ProjectGroup[] {
  const active = getActivePtySessions();
  if (active.size === 0) return groups;
  const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
  return groups.map(g => ({
    ...g,
    sessions: g.sessions.map(s => {
      // For merged sessions, check all constituent session IDs
      const idsToCheck = s.slugSessionIds || [s.sessionId];
      const hasPty = idsToCheck.some(id => active.has(id));
      if (!hasPty) return s;

      // PTY is active — check if Claude has finished its turn
      const sessionFile = path.join(PROJECTS_DIR, s.projectHash, `${s.sessionId}.jsonl`);
      try {
        const lastState = getLastRecordState(sessionFile);
        if (lastState.type === 'assistant' && lastState.isEndTurn) {
          return { ...s, status: 'done' as const };
        }
      } catch {
        // fall through to running
      }
      return { ...s, status: 'running' as const };
    }),
  }));
}

/** Overlay pinned status and sort pinned sessions first within each group.
 *  Mayor session is always pinned and sorted above all others. */
function overlayPinnedStatus(groups: ProjectGroup[]): ProjectGroup[] {
  const pinned = getPinnedSessionIds();
  const mayorId = getMayorSessionId();
  return groups.map(g => {
    const sessions = g.sessions.map(s => {
      const ids = s.slugSessionIds || [s.sessionId];
      const isMayor = mayorId != null && ids.includes(mayorId);
      const isPinned = isMayor || pinned.has(s.sessionId);
      if (!isPinned && !isMayor) return s;
      return { ...s, pinned: isPinned || undefined, isMayor: isMayor || undefined };
    });
    sessions.sort((a, b) => {
      // Mayor always first
      if (a.isMayor && !b.isMayor) return -1;
      if (!a.isMayor && b.isMayor) return 1;
      // Then pinned
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0;
    });
    return { ...g, sessions };
  });
}

function filterGroups(
  groups: ProjectGroup[],
  query?: string,
  hideEmpty?: boolean,
  managedOnly?: boolean,
  includeArchived?: boolean,
): ProjectGroup[] {
  let managedSet: Set<string> | null = null;
  if (managedOnly) {
    managedSet = new Set(getManagedSessionMap().keys());
  }

  const archivedIds = getArchivedSessionIds();

  return groups
    .map(g => ({
      ...g,
      sessions: g.sessions.filter(s => {
        const idsToCheck = s.slugSessionIds || [s.sessionId];
        const allArchived = idsToCheck.every(id => archivedIds.has(id));
        if (includeArchived) {
          if (!allArchived) return false;
        } else {
          if (allArchived && archivedIds.has(s.sessionId)) return false;
        }
        if (hideEmpty && s.messageCount === 0) return false;
        if (managedSet && !managedSet.has(s.sessionId)) return false;
        if (query) {
          const q = query.toLowerCase();
          return (
            s.lastMessage.toLowerCase().includes(q) ||
            s.projectPath.toLowerCase().includes(q) ||
            s.sessionId.includes(q) ||
            (s.displayName?.toLowerCase().includes(q) ?? false)
          );
        }
        return true;
      }),
    }))
    .filter(g => g.sessions.length > 0);
}
