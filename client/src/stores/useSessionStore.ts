import { create } from 'zustand';
import { ProjectGroup } from '../types';
import {
  fetchSessions,
  createSession as apiCreateSession,
  renameSession as apiRenameSession,
  archiveSession as apiArchiveSession,
  deleteSession as apiDeleteSession,
  pinSession as apiPinSession,
  fetchArchivedSessions,
  searchSessionContent,
  ContentSearchResult,
} from '../api/sessions';
import { checkForAttentionTransitions, initPrevStatusMap } from '../utils/notifications';

interface SessionState {
  groups: ProjectGroup[];
  archivedGroups: ProjectGroup[];
  archivedCount: number;
  query: string;
  statusFilter: Set<string>;
  loading: boolean;
  error: string | null;
  expandedSet: Set<string>;
  creating: boolean;
  archivedExpanded: boolean;
  archivedGroupExpanded: Set<string>;
  contentSearchResults: ContentSearchResult[];
  contentSearching: boolean;

  // Internal
  _initializedExpanded: boolean;
  _eventWs: WebSocket | null;
  _reconnectTimer: ReturnType<typeof setTimeout> | null;
  _runningPollTimer: ReturnType<typeof setInterval> | null;

  // Actions
  fetchSessions: (q?: string) => Promise<void>;
  fetchArchived: () => Promise<void>;
  createSession: (projectPath: string, opts?: { worktree?: { branchName: string }; displayName?: string; initialPrompt?: string; model?: string; permissionMode?: string }) => Promise<{ projectHash: string; sessionId: string; projectPath: string } | null>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  pinSession: (sessionId: string) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  unarchiveSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  toggleGroup: (hash: string) => void;
  toggleAllGroups: () => void;
  toggleArchivedGroup: (hash: string) => void;
  setQuery: (q: string) => void;
  setStatusFilter: (v: Set<string>) => void;
  setArchivedExpanded: (v: boolean) => void;
  searchContent: (query: string) => Promise<void>;
  clearContentSearch: () => void;

  // Event stream (R5)
  connectEventStream: () => void;
  disconnectEventStream: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  groups: [],
  archivedGroups: [],
  archivedCount: 0,
  query: '',
  statusFilter: new Set(),
  loading: true,
  error: null,
  expandedSet: new Set(),
  creating: false,
  archivedExpanded: false,
  archivedGroupExpanded: new Set(),
  contentSearchResults: [],
  contentSearching: false,
  _initializedExpanded: false,
  _eventWs: null,
  _reconnectTimer: null,
  _runningPollTimer: null,

  fetchSessions: async (q?: string) => {
    try {
      set({ error: null });
      const data = await fetchSessions(q, true);
      set((state) => {
        const newState: Partial<SessionState> = { groups: data, loading: false };
        if (!state._initializedExpanded && data.length > 0) {
          newState.expandedSet = new Set(data.map(g => g.projectHash));
          newState._initializedExpanded = true;
          // Initialize status map on first load (no notifications)
          initPrevStatusMap(data);
        } else {
          // Check for status transitions to fire notifications
          checkForAttentionTransitions(data);
        }
        return newState;
      });

      // Start/stop polling based on whether any session is running
      const hasRunning = data.some(g => g.sessions.some(s => s.status === 'running'));
      const { _runningPollTimer } = get();
      if (hasRunning && !_runningPollTimer) {
        const timer = setInterval(() => {
          get().fetchSessions(get().query || undefined);
        }, 5000);
        set({ _runningPollTimer: timer });
      } else if (!hasRunning && _runningPollTimer) {
        clearInterval(_runningPollTimer);
        set({ _runningPollTimer: null });
      }
    } catch (e: any) {
      set({ error: e.message, loading: false });
    }
  },

  fetchArchived: async () => {
    try {
      const data = await fetchArchivedSessions();
      set({ archivedGroups: data.groups, archivedCount: data.count });
    } catch {
      // silently fail
    }
  },

  createSession: async (projectPath, opts) => {
    set({ creating: true });
    try {
      const result = await apiCreateSession(projectPath, opts);
      const q = get().query;
      await get().fetchSessions(q || undefined);
      return result;
    } catch (e: any) {
      throw e;
    } finally {
      set({ creating: false });
    }
  },

  renameSession: async (sessionId, name) => {
    try {
      await apiRenameSession(sessionId, name);
      await get().fetchSessions(get().query || undefined);
    } catch (e: any) {
      alert(`Failed to rename session: ${e.message}`);
    }
  },

  pinSession: async (sessionId) => {
    // Toggle: find current pinned state
    const { groups } = get();
    let currentlyPinned = false;
    for (const g of groups) {
      const s = g.sessions.find(s => s.sessionId === sessionId);
      if (s) { currentlyPinned = !!s.pinned; break; }
    }
    try {
      await apiPinSession(sessionId, !currentlyPinned);
      await get().fetchSessions(get().query || undefined);
    } catch (e: any) {
      alert(`Failed to pin session: ${e.message}`);
    }
  },

  archiveSession: async (sessionId) => {
    try {
      await apiArchiveSession(sessionId, true);
      await get().fetchSessions(get().query || undefined);
      await get().fetchArchived();
    } catch (e: any) {
      alert(`Failed to archive session: ${e.message}`);
    }
  },

  unarchiveSession: async (sessionId) => {
    try {
      await apiArchiveSession(sessionId, false);
      await get().fetchSessions(get().query || undefined);
      await get().fetchArchived();
    } catch (e: any) {
      alert(`Failed to unarchive session: ${e.message}`);
    }
  },

  deleteSession: async (sessionId) => {
    const { groups, archivedGroups } = get();
    const allGroups = [...groups, ...archivedGroups];
    let projectHash = '';
    for (const g of allGroups) {
      const s = g.sessions.find(s => s.sessionId === sessionId);
      if (s) { projectHash = g.projectHash; break; }
    }
    if (!projectHash) return;

    if (!window.confirm('Are you sure you want to permanently delete this session? This cannot be undone.')) return;

    try {
      await apiDeleteSession(projectHash, sessionId);
      await get().fetchSessions(get().query || undefined);
      await get().fetchArchived();
    } catch (e: any) {
      alert(`Failed to delete session: ${e.message}`);
    }
  },

  toggleGroup: (hash) => {
    set((state) => {
      const next = new Set(state.expandedSet);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return { expandedSet: next };
    });
  },

  toggleAllGroups: () => {
    set((state) => {
      const allExpanded = state.groups.length > 0 && state.groups.every(g => state.expandedSet.has(g.projectHash));
      if (allExpanded) {
        return { expandedSet: new Set() };
      } else {
        return { expandedSet: new Set(state.groups.map(g => g.projectHash)) };
      }
    });
  },

  toggleArchivedGroup: (hash) => {
    set((state) => {
      const next = new Set(state.archivedGroupExpanded);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return { archivedGroupExpanded: next };
    });
  },

  setQuery: (q) => set({ query: q }),
  setStatusFilter: (v) => set({ statusFilter: v }),
  setArchivedExpanded: (v) => set({ archivedExpanded: v }),

  searchContent: async (query: string) => {
    set({ contentSearching: true });
    try {
      const results = await searchSessionContent(query);
      set({ contentSearchResults: results, contentSearching: false });
    } catch {
      set({ contentSearchResults: [], contentSearching: false });
    }
  },

  clearContentSearch: () => set({ contentSearchResults: [], contentSearching: false }),

  connectEventStream: () => {
    const { _eventWs } = get();
    if (_eventWs) return; // already connected

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/events`);

    ws.onmessage = () => {
      // Any event triggers a refresh
      get().fetchSessions(get().query || undefined);
      get().fetchArchived();
    };

    ws.onclose = () => {
      set({ _eventWs: null });
      // Auto-reconnect after 3s
      const timer = setTimeout(() => {
        set({ _reconnectTimer: null });
        get().connectEventStream();
      }, 3000);
      set({ _reconnectTimer: timer });
    };

    ws.onerror = () => {
      ws.close();
    };

    set({ _eventWs: ws });
  },

  disconnectEventStream: () => {
    const { _eventWs, _reconnectTimer, _runningPollTimer } = get();
    if (_reconnectTimer) clearTimeout(_reconnectTimer);
    if (_runningPollTimer) clearInterval(_runningPollTimer);
    if (_eventWs) _eventWs.close();
    set({ _eventWs: null, _reconnectTimer: null, _runningPollTimer: null });
  },
}));
