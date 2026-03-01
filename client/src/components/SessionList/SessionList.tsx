import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { useUIStore } from '../../stores/useUIStore';
import { archiveSession as apiArchiveSession, deleteSession as apiDeleteSession } from '../../api/sessions';
import SearchBar from './SearchBar';
import ProjectGroup from './ProjectGroup';

interface ContextMenuState {
  x: number;
  y: number;
  hasArchived: boolean;
  hasUnarchived: boolean;
}

export default function SessionList() {
  const {
    groups,
    archivedGroups,
    archivedCount,
    query,
    managedOnly,
    loading,
    error,
    expandedSet,
    creating,
    archivedExpanded,
    archivedGroupExpanded,
    fetchSessions,
    fetchArchived,
    createSession,
    toggleAllGroups,
    setQuery,
    setManagedOnly,
    setArchivedExpanded,
  } = useSessionStore();

  const selectSession = useUIStore(s => s.selectSession);
  const clearSelected = useUIStore(s => s.clearSelected);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const lastClickedIndexRef = useRef<number>(-1);
  const menuRef = useRef<HTMLDivElement>(null);

  // Initial load
  useEffect(() => {
    fetchSessions();
    fetchArchived();
  }, [fetchSessions, fetchArchived]);

  // Debounced query search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSessions(query || undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, fetchSessions, managedOnly]);

  // Flat list of visible sessions for shift-click range selection
  const flatVisibleSessions = useMemo(() => {
    const result: { sessionId: string; projectHash: string; projectPath: string; isArchived: boolean }[] = [];
    for (const g of groups) {
      if (expandedSet.has(g.projectHash)) {
        for (const s of g.sessions) {
          result.push({ sessionId: s.sessionId, projectHash: g.projectHash, projectPath: g.projectPath, isArchived: false });
        }
      }
    }
    if (archivedExpanded) {
      for (const g of archivedGroups) {
        if (archivedGroupExpanded.has(g.projectHash)) {
          for (const s of g.sessions) {
            result.push({ sessionId: s.sessionId, projectHash: g.projectHash, projectPath: g.projectPath, isArchived: true });
          }
        }
      }
    }
    return result;
  }, [groups, archivedGroups, expandedSet, archivedExpanded, archivedGroupExpanded]);

  // Build a lookup: sessionId → { projectHash, isArchived }
  const sessionLookup = useMemo(() => {
    const map = new Map<string, { projectHash: string; projectPath: string; isArchived: boolean }>();
    for (const g of groups) {
      for (const s of g.sessions) {
        map.set(s.sessionId, { projectHash: g.projectHash, projectPath: g.projectPath, isArchived: false });
      }
    }
    for (const g of archivedGroups) {
      for (const s of g.sessions) {
        map.set(s.sessionId, { projectHash: g.projectHash, projectPath: g.projectPath, isArchived: true });
      }
    }
    return map;
  }, [groups, archivedGroups]);

  // Escape clears selection, click-outside closes context menu
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setContextMenu(null);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenu && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu]);

  const handleSessionClick = useCallback((e: React.MouseEvent, sessionId: string) => {
    const flatIndex = flatVisibleSessions.findIndex(s => s.sessionId === sessionId);

    if (e.shiftKey && lastClickedIndexRef.current >= 0) {
      // Range select
      const start = Math.min(lastClickedIndexRef.current, flatIndex);
      const end = Math.max(lastClickedIndexRef.current, flatIndex);
      const next = new Set(selectedIds);
      for (let i = start; i <= end; i++) {
        next.add(flatVisibleSessions[i].sessionId);
      }
      setSelectedIds(next);
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle single
      const next = new Set(selectedIds);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      setSelectedIds(next);
      lastClickedIndexRef.current = flatIndex;
    } else {
      // Plain click — clear selection and open detail
      setSelectedIds(new Set());
      setContextMenu(null);
      const info = sessionLookup.get(sessionId);
      if (info) {
        selectSession(info.projectHash, sessionId, info.projectPath);
      }
      lastClickedIndexRef.current = flatIndex;
    }
  }, [flatVisibleSessions, selectedIds, sessionLookup, selectSession]);

  const handleSessionContextMenu = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();

    // If right-clicking an item not in selection, select just that item
    let activeSelection = selectedIds;
    if (!selectedIds.has(sessionId)) {
      activeSelection = new Set([sessionId]);
      setSelectedIds(activeSelection);
    }

    // Determine if selection contains archived / unarchived items
    let hasArchived = false;
    let hasUnarchived = false;
    for (const id of activeSelection) {
      const info = sessionLookup.get(id);
      if (info?.isArchived) hasArchived = true;
      else hasUnarchived = true;
    }

    setContextMenu({ x: e.clientX, y: e.clientY, hasArchived, hasUnarchived });
  }, [selectedIds, sessionLookup]);

  const refresh = useCallback(async () => {
    await Promise.all([
      fetchSessions(query || undefined),
      fetchArchived(),
    ]);
  }, [fetchSessions, fetchArchived, query]);

  const handleBatchArchive = useCallback(async () => {
    setContextMenu(null);
    const ids = Array.from(selectedIds);
    try {
      for (const id of ids) {
        await apiArchiveSession(id, true);
      }
    } catch (e: any) {
      alert(`Failed to archive some sessions: ${e.message}`);
    }
    setSelectedIds(new Set());
    await refresh();
  }, [selectedIds, refresh]);

  const handleBatchUnarchive = useCallback(async () => {
    setContextMenu(null);
    const ids = Array.from(selectedIds);
    try {
      for (const id of ids) {
        await apiArchiveSession(id, false);
      }
    } catch (e: any) {
      alert(`Failed to unarchive some sessions: ${e.message}`);
    }
    setSelectedIds(new Set());
    await refresh();
  }, [selectedIds, refresh]);

  const handleBatchDelete = useCallback(async () => {
    setContextMenu(null);
    const count = selectedIds.size;
    if (!window.confirm(`Are you sure you want to permanently delete ${count} session${count > 1 ? 's' : ''}? This cannot be undone.`)) return;

    const ids = Array.from(selectedIds);
    try {
      for (const id of ids) {
        const info = sessionLookup.get(id);
        if (info) {
          await apiDeleteSession(info.projectHash, id);
        }
      }
    } catch (e: any) {
      alert(`Failed to delete some sessions: ${e.message}`);
    }
    setSelectedIds(new Set());
    await refresh();
  }, [selectedIds, sessionLookup, refresh]);

  const allExpanded = groups.length > 0 && groups.every(g => expandedSet.has(g.projectHash));

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-semibold text-gray-200">Claude Sessions</h1>
            <button
              onClick={toggleAllGroups}
              title={allExpanded ? 'Collapse all' : 'Expand all'}
              className="text-gray-500 hover:text-gray-300 transition-colors p-0.5"
            >
              <span className={`inline-block text-xs transition-transform ${allExpanded ? 'rotate-90' : ''}`}>▶</span>
            </button>
          </div>
          <button
            onClick={() => clearSelected()}
            disabled={creating}
            className="text-xs px-2 py-1 rounded bg-claude hover:bg-claude-hover disabled:opacity-50 text-white transition-colors"
          >
            {creating ? '...' : '+ New'}
          </button>
        </div>
        {/* Toggle pill */}
        <div className="flex rounded-md overflow-hidden border border-gray-700 text-xs">
          <button
            onClick={() => setManagedOnly(false)}
            className={`flex-1 px-3 py-1 transition-colors ${
              !managedOnly ? 'bg-gray-700 text-gray-200' : 'bg-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setManagedOnly(true)}
            className={`flex-1 px-3 py-1 transition-colors ${
              managedOnly ? 'bg-gray-700 text-gray-200' : 'bg-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            Manager
          </button>
        </div>
      </div>

      {/* Selection action bar */}
      {selectedIds.size > 0 && (
        <div className="px-3 py-1.5 bg-claude/10 border-b border-claude/20 flex items-center gap-2">
          <span className="text-xs text-claude mr-auto">{selectedIds.size} selected</span>
          <button
            onClick={handleBatchArchive}
            className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            Archive
          </button>
          <button
            onClick={handleBatchDelete}
            className="text-xs px-2 py-0.5 rounded bg-red-900/50 hover:bg-red-800/50 text-red-400 transition-colors"
          >
            Delete
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setContextMenu(null); }}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-1"
            title="Clear selection (Esc)"
          >
            ✕
          </button>
        </div>
      )}

      <SearchBar value={query} onChange={setQuery} />
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 text-sm text-gray-500">Loading sessions...</div>
        )}
        {error && (
          <div className="p-4 text-sm text-red-400">{error}</div>
        )}
        {!loading && !error && groups.length === 0 && archivedCount === 0 && (
          <div className="p-4 text-sm text-gray-500">No sessions found</div>
        )}
        {groups.map(g => (
          <ProjectGroup
            key={g.projectHash}
            group={g}
            selectedIds={selectedIds}
            onSessionClick={handleSessionClick}
            onSessionContextMenu={handleSessionContextMenu}
          />
        ))}

        {/* Archived section */}
        {archivedCount > 0 && (
          <div className="border-t border-gray-800 mt-2">
            <button
              onClick={() => setArchivedExpanded(!archivedExpanded)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-800
                         text-xs font-medium text-gray-500 border-b border-gray-800"
            >
              <span className={`transition-transform ${archivedExpanded ? 'rotate-90' : ''}`}>
                ▶
              </span>
              <span>Archived ({archivedCount})</span>
            </button>
            {archivedExpanded && archivedGroups.map(g => (
              <ProjectGroup
                key={`archived-${g.projectHash}`}
                group={g}
                isArchived
                selectedIds={selectedIds}
                onSessionClick={handleSessionClick}
                onSessionContextMenu={handleSessionContextMenu}
              />
            ))}
          </div>
        )}
      </div>

      {/* Batch context menu */}
      {contextMenu && selectedIds.size > 0 && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-700">
            {selectedIds.size} session{selectedIds.size > 1 ? 's' : ''}
          </div>
          {contextMenu.hasUnarchived && (
            <button
              onClick={handleBatchArchive}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Archive
            </button>
          )}
          {contextMenu.hasArchived && (
            <button
              onClick={handleBatchUnarchive}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Unarchive
            </button>
          )}
          <button
            onClick={handleBatchDelete}
            className="w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-gray-700 transition-colors"
          >
            Delete
          </button>
        </div>
      )}

    </div>
  );
}
