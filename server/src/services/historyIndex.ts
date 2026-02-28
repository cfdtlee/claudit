import { ProjectGroup } from '../types.js';
import { getManagedSessionMap, getArchivedSessionIds, getPinnedSessionIds } from './managedSessions.js';
import { scanProjectSessions } from './sessionScanner.js';

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

/** Get sessions grouped by project, with optional search filter */
export function getSessionIndex(
  query?: string,
  hideEmpty?: boolean,
  managedOnly?: boolean,
  includeArchived?: boolean,
): ProjectGroup[] {
  if (cache && Date.now() - cache.timestamp < CACHE_TTL) {
    return filterGroups(overlayRunningStatus(cache.data), query, hideEmpty, managedOnly, includeArchived);
  }

  const summaries = scanProjectSessions();

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

/** Overlay running status from active PTY sessions (not cached) */
function overlayRunningStatus(groups: ProjectGroup[]): ProjectGroup[] {
  const active = getActivePtySessions();
  if (active.size === 0) return groups;
  return groups.map(g => ({
    ...g,
    sessions: g.sessions.map(s =>
      active.has(s.sessionId) ? { ...s, status: 'running' as const } : s
    ),
  }));
}

/** Overlay pinned status and sort pinned sessions first within each group */
function overlayPinnedStatus(groups: ProjectGroup[]): ProjectGroup[] {
  const pinned = getPinnedSessionIds();
  if (pinned.size === 0) return groups;
  return groups.map(g => {
    const sessions = g.sessions.map(s =>
      pinned.has(s.sessionId) ? { ...s, pinned: true } : s
    );
    sessions.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return 0; // preserve existing order within same pin status
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
        if (includeArchived) {
          if (!archivedIds.has(s.sessionId)) return false;
        } else {
          if (archivedIds.has(s.sessionId)) return false;
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
