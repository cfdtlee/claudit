import { ProjectGroup, SessionDetail, MergedSessionDetail } from '../types';

export interface ArchivedResponse {
  count: number;
  groups: ProjectGroup[];
}

export interface GitInfo {
  branch: string;
  repoName: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo?: boolean;
  gitInfo?: GitInfo;
}

export interface DirectoryListing {
  currentPath: string;
  parentPath: string | null;
  isGitRepo: boolean;
  gitInfo?: GitInfo;
  entries: DirectoryEntry[];
}

export async function fetchSessions(
  query?: string,
  hideEmpty?: boolean,
  managedOnly?: boolean,
): Promise<ProjectGroup[]> {
  const params = new URLSearchParams();
  if (query) params.set('q', query);
  if (hideEmpty) params.set('hideEmpty', 'true');
  if (managedOnly) params.set('managedOnly', 'true');
  const qs = params.toString();
  const res = await fetch(`/api/sessions${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchSessionDetail(
  projectHash: string,
  sessionId: string
): Promise<SessionDetail> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(projectHash)}/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error('Failed to fetch session detail');
  return res.json();
}

export async function fetchMergedSessionDetail(
  projectHash: string,
  slug: string
): Promise<MergedSessionDetail> {
  const res = await fetch(`/api/sessions/merged/${encodeURIComponent(projectHash)}/${encodeURIComponent(slug)}`);
  if (!res.ok) throw new Error('Failed to fetch merged session detail');
  return res.json();
}

export async function createSession(
  projectPath: string,
  opts?: { worktree?: { branchName: string }; displayName?: string; initialPrompt?: string },
): Promise<{ sessionId: string; projectPath: string; projectHash: string }> {
  const res = await fetch('/api/sessions/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath, ...opts }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to create session' }));
    throw new Error(err.error || 'Failed to create session');
  }
  return res.json();
}

export async function renameSession(
  sessionId: string,
  name: string,
): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to rename session' }));
    throw new Error(err.error || 'Failed to rename session');
  }
}

export async function pinSession(
  sessionId: string,
  pinned: boolean,
): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/pin`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinned }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to pin session' }));
    throw new Error(err.error || 'Failed to pin session');
  }
}

export async function archiveSession(
  sessionId: string,
  archived: boolean,
): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/archive`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to archive session' }));
    throw new Error(err.error || 'Failed to archive session');
  }
}

export async function markSessionSeen(sessionId: string): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/seen`, {
    method: 'PATCH',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to mark session seen' }));
    throw new Error(err.error || 'Failed to mark session seen');
  }
}

export async function deleteSession(
  projectHash: string,
  sessionId: string,
): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(projectHash)}/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete session' }));
    throw new Error(err.error || 'Failed to delete session');
  }
}

export interface ContentSearchResult {
  sessionId: string;
  projectHash: string;
  projectPath: string;
  snippet: string;
  matchCount: number;
}

export async function searchSessionContent(query: string): Promise<ContentSearchResult[]> {
  const res = await fetch(`/api/sessions/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to search sessions');
  const data = await res.json();
  return data.results;
}

export async function fetchArchivedSessions(): Promise<ArchivedResponse> {
  const res = await fetch('/api/sessions/archived');
  if (!res.ok) throw new Error('Failed to fetch archived sessions');
  return res.json();
}

export async function listDirectory(dirPath?: string): Promise<DirectoryListing> {
  const params = new URLSearchParams();
  if (dirPath) params.set('path', dirPath);
  const qs = params.toString();
  const res = await fetch(`/api/filesystem/list${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to list directory' }));
    throw new Error(err.error || 'Failed to list directory');
  }
  return res.json();
}
