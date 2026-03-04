import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSessionStore } from '../../stores/useSessionStore';
import { useUIStore } from '../../stores/useUIStore';
import { archiveSession as apiArchiveSession, deleteSession as apiDeleteSession } from '../../api/sessions';
import { cn } from '../../lib/utils';
import { ChevronDown, ChevronRight, Archive, Trash2, X, Plus, ChevronsUpDown } from 'lucide-react';
import SearchBar from './SearchBar';
import ProjectGroup from './ProjectGroup';

interface ContextMenuState {
  x: number;
  y: number;
  hasArchived: boolean;
  hasUnarchived: boolean;
}

const STATUS_OPTIONS = ['running', 'idle', 'done'] as const;

export default function SessionList() {
  const {
    groups,
    archivedGroups,
    archivedCount,
    query,
    statusFilter,
    loading,
    error,
    expandedSet,
    creating,
    archivedExpanded,
    archivedGroupExpanded,
    contentSearchResults,
    contentSearching,
    fetchSessions,
    fetchArchived,
    toggleAllGroups,
    setQuery,
    setStatusFilter,
    setArchivedExpanded,
    searchContent,
    clearContentSearch,
  } = useSessionStore();

  const selectSession = useUIStore(s => s.selectSession);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const lastClickedIndexRef = useRef<number>(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSessions();
    fetchArchived();
  }, [fetchSessions, fetchArchived]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) {
        searchContent(query);
      } else {
        clearContentSearch();
        fetchSessions();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, fetchSessions, searchContent, clearContentSearch]);

  useEffect(() => {
    if (!statusDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [statusDropdownOpen]);

  const filteredGroups = useMemo(() => {
    if (statusFilter.size === 0) return groups;
    return groups.map(g => ({
      ...g,
      sessions: g.sessions.filter(s => statusFilter.has(s.status ?? 'idle')),
    })).filter(g => g.sessions.length > 0);
  }, [groups, statusFilter]);

  const flatVisibleSessions = useMemo(() => {
    const result: { sessionId: string; projectHash: string; projectPath: string; isArchived: boolean }[] = [];
    for (const g of filteredGroups) {
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
  }, [filteredGroups, archivedGroups, expandedSet, archivedExpanded, archivedGroupExpanded]);

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
      const start = Math.min(lastClickedIndexRef.current, flatIndex);
      const end = Math.max(lastClickedIndexRef.current, flatIndex);
      const next = new Set(selectedIds);
      for (let i = start; i <= end; i++) {
        next.add(flatVisibleSessions[i].sessionId);
      }
      setSelectedIds(next);
    } else if (e.metaKey || e.ctrlKey) {
      const next = new Set(selectedIds);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      setSelectedIds(next);
      lastClickedIndexRef.current = flatIndex;
    } else {
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
    let activeSelection = selectedIds;
    if (!selectedIds.has(sessionId)) {
      activeSelection = new Set([sessionId]);
      setSelectedIds(activeSelection);
    }
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
      for (const id of ids) await apiArchiveSession(id, true);
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
      for (const id of ids) await apiArchiveSession(id, false);
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
        if (info) await apiDeleteSession(info.projectHash, id);
      }
    } catch (e: any) {
      alert(`Failed to delete some sessions: ${e.message}`);
    }
    setSelectedIds(new Set());
    await refresh();
  }, [selectedIds, sessionLookup, refresh]);

  const toggleStatusOption = (status: string) => {
    const next = new Set(statusFilter);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setStatusFilter(next);
  };

  const statusLabel = statusFilter.size === 0
    ? 'All statuses'
    : Array.from(statusFilter).join(', ');

  const allExpanded = filteredGroups.length > 0 && filteredGroups.every(g => expandedSet.has(g.projectHash));
  const clearSelected = useUIStore(s => s.clearSelected);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">Sessions</h2>
            <button
              onClick={toggleAllGroups}
              title={allExpanded ? 'Collapse all' : 'Expand all'}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded hover:bg-accent"
            >
              <ChevronsUpDown className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            onClick={() => clearSelected()}
            disabled={creating}
            className={cn(
              'text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1',
              'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50',
              'shadow-sm shadow-primary/20'
            )}
          >
            <Plus className="w-3 h-3" />
            {creating ? '...' : 'New'}
          </button>
        </div>

        {/* Status filter */}
        <div className="relative mt-2.5" ref={statusDropdownRef}>
          <button
            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            className="w-full flex items-center justify-between text-xs px-3 py-1.5 rounded-lg border border-border/50 bg-secondary/30 text-secondary-foreground hover:bg-secondary/50 transition-colors"
          >
            <span className="truncate capitalize">{statusLabel}</span>
            <ChevronDown className={cn(
              'w-3 h-3 text-muted-foreground transition-transform',
              statusDropdownOpen && 'rotate-180'
            )} />
          </button>
          {statusDropdownOpen && (
            <div className="absolute z-30 mt-1 w-full bg-popover border border-border rounded-lg shadow-xl py-1 animate-fade-in">
              {STATUS_OPTIONS.map(status => (
                <label
                  key={status}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-popover-foreground hover:bg-accent cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={statusFilter.has(status)}
                    onChange={() => toggleStatusOption(status)}
                    className="rounded w-3 h-3 bg-secondary border-border accent-primary"
                  />
                  <span className="capitalize">{status}</span>
                </label>
              ))}
              {statusFilter.size > 0 && (
                <button
                  onClick={() => setStatusFilter(new Set())}
                  className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-t border-border mt-1"
                >
                  Clear filter
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="px-3 py-2 bg-primary/5 border-b border-primary/10 flex items-center gap-2 animate-slide-in">
          <span className="text-xs text-primary font-medium mr-auto">{selectedIds.size} selected</span>
          <button
            onClick={handleBatchArchive}
            className="text-xs px-2 py-1 rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors flex items-center gap-1"
          >
            <Archive className="w-3 h-3" /> Archive
          </button>
          <button
            onClick={handleBatchDelete}
            className="text-xs px-2 py-1 rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Delete
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setContextMenu(null); }}
            className="text-muted-foreground hover:text-foreground transition-colors ml-1"
            title="Clear selection (Esc)"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <SearchBar value={query} onChange={setQuery} />

      <div className="flex-1 sidebar-scroll">
        {query ? (
          contentSearching ? (
            <div className="p-4 text-sm text-muted-foreground">Searching content...</div>
          ) : contentSearchResults.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No matches found</div>
          ) : (
            contentSearchResults.map(r => (
              <button
                key={r.sessionId}
                onClick={() => selectSession(r.projectHash, r.sessionId, r.projectPath)}
                className="w-full text-left hover:bg-accent/50 transition-colors"
              >
                <div className="px-4 py-2.5">
                  <div className="text-sm text-foreground truncate">{r.projectPath.split('/').pop()}/{r.sessionId.slice(0, 8)}</div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">{r.snippet}</div>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5">{r.matchCount} match{r.matchCount > 1 ? 'es' : ''}</div>
                </div>
              </button>
            ))
          )
        ) : (
        <>
        {loading && (
          <div className="p-4 text-sm text-muted-foreground">Loading sessions...</div>
        )}
        {error && (
          <div className="p-4 text-sm text-destructive">{error}</div>
        )}
        {!loading && !error && filteredGroups.length === 0 && archivedCount === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">
            <p>No sessions found</p>
          </div>
        )}
        {filteredGroups.map(g => (
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
          <div className="border-t border-border/30 mt-1">
            <button
              onClick={() => setArchivedExpanded(!archivedExpanded)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent/50
                         text-xs font-medium text-muted-foreground transition-colors"
            >
              <ChevronRight className={cn(
                'w-3 h-3 transition-transform',
                archivedExpanded && 'rotate-90'
              )} />
              <Archive className="w-3 h-3" />
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
        </>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && selectedIds.size > 0 && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-popover border border-border rounded-lg shadow-2xl py-1 min-w-[160px] animate-fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
            {selectedIds.size} session{selectedIds.size > 1 ? 's' : ''}
          </div>
          {contextMenu.hasUnarchived && (
            <button
              onClick={handleBatchArchive}
              className="w-full text-left px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent transition-colors flex items-center gap-2"
            >
              <Archive className="w-3.5 h-3.5" /> Archive
            </button>
          )}
          {contextMenu.hasArchived && (
            <button
              onClick={handleBatchUnarchive}
              className="w-full text-left px-3 py-1.5 text-sm text-popover-foreground hover:bg-accent transition-colors flex items-center gap-2"
            >
              <Archive className="w-3.5 h-3.5" /> Unarchive
            </button>
          )}
          <button
            onClick={handleBatchDelete}
            className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-accent transition-colors flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
