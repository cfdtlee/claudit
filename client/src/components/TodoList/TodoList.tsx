import { useState, useEffect, useCallback, useRef } from 'react';
import { TodoItem as TodoItemType, TodoGroup, SessionSummary } from '../../types';
import { fetchTodos, updateTodo, reorderTodos } from '../../api/todo';
import { fetchGroups, createGroup } from '../../api/groups';
import { fetchSessions } from '../../api/sessions';
import { useUIStore } from '../../stores/useUIStore';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import TodoItem from './TodoItem';
import GroupManager from './GroupManager';

type Filter = 'all' | 'active' | 'done';
type GroupFilter = 'all' | 'ungrouped' | string; // string = groupId

interface Props {
  selectedTodoId: string | null;
  onSelect: (id: string | null) => void;
}

export default function TodoList({ selectedTodoId, onSelect }: Props) {
  const [todos, setTodos] = useState<TodoItemType[]>([]);
  const [groups, setGroups] = useState<TodoGroup[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [groupFilter, setGroupFilter] = useState<GroupFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; todoIds: string[] } | null>(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('claudit:collapsedGroups');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  const todoSessionPrefill = useUIStore(s => s.todoSessionPrefill);
  const setTodoSessionPrefill = useUIStore(s => s.setTodoSessionPrefill);

  const toggleGroupCollapsed = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      try { localStorage.setItem('claudit:collapsedGroups', JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  const lastClickedIndex = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  // Build session status map
  const sessionStatusMap = new Map<string, SessionSummary>();
  sessions.forEach(s => sessionStatusMap.set(s.sessionId, s));

  const loadTodos = useCallback(async () => {
    try {
      const data = await fetchTodos();
      setTodos(data);
    } catch (err) {
      console.error('Failed to load todos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const data = await fetchGroups();
      setGroups(data);
    } catch (err) {
      console.error('Failed to load groups:', err);
    }
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      const groups = await fetchSessions(undefined, true);
      const allSessions = groups.flatMap(g => g.sessions);
      setSessions(allSessions);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, []);

  useEffect(() => {
    loadTodos();
    loadGroups();
    loadSessions();
    const interval = setInterval(loadTodos, 10000);
    return () => clearInterval(interval);
  }, [loadTodos, loadGroups, loadSessions]);

  // Watch for session→todo prefill
  useEffect(() => {
    if (todoSessionPrefill) {
      onSelect(null);
    }
  }, [todoSessionPrefill, onSelect]);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleToggle = async (todo: TodoItemType) => {
    try {
      const updated = await updateTodo(todo.id, {
        completed: !todo.completed,
        completedAt: !todo.completed ? new Date().toISOString() : undefined,
      });
      setTodos(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch (err) {
      console.error('Failed to toggle todo:', err);
    }
  };

  const handleSelect = (todoId: string, e: React.MouseEvent) => {
    const filteredList = getFilteredTodos();
    const index = filteredList.findIndex(t => t.id === todoId);

    if (e.shiftKey && lastClickedIndex.current !== null) {
      // Range select
      const start = Math.min(lastClickedIndex.current, index);
      const end = Math.max(lastClickedIndex.current, index);
      const rangeIds = filteredList.slice(start, end + 1).map(t => t.id);
      setSelectedIds(new Set(rangeIds));
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle select
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(todoId)) next.delete(todoId);
        else next.add(todoId);
        return next;
      });
    } else {
      setSelectedIds(new Set());
    }
    lastClickedIndex.current = index;
    onSelect(todoId);
  };

  const handleContextMenu = (todoId: string, e: React.MouseEvent) => {
    e.preventDefault();
    const ids = selectedIds.size > 0 && selectedIds.has(todoId)
      ? Array.from(selectedIds)
      : [todoId];
    setContextMenu({ x: e.clientX, y: e.clientY, todoIds: ids });
  };

  const handleMoveToGroup = async (targetGroupId: string | null) => {
    if (!contextMenu) return;
    const items = contextMenu.todoIds.map(id => {
      const todo = todos.find(t => t.id === id);
      return { id, position: todo?.position ?? 0, groupId: targetGroupId ?? undefined };
    });
    try {
      await reorderTodos(items);
      await loadTodos();
    } catch (err) {
      console.error('Failed to move todos:', err);
    }
    setContextMenu(null);
    setSelectedIds(new Set());
  };

  const handleCreateGroupFromContext = async () => {
    if (!newGroupName.trim()) return;
    try {
      const group = await createGroup(newGroupName.trim());
      await loadGroups();
      setNewGroupName('');
      setShowNewGroupInput(false);
      if (contextMenu) {
        const items = contextMenu.todoIds.map(id => {
          const todo = todos.find(t => t.id === id);
          return { id, position: todo?.position ?? 0, groupId: group.id };
        });
        await reorderTodos(items);
        await loadTodos();
      }
    } catch (err) {
      console.error('Failed to create group:', err);
    }
    setContextMenu(null);
    setSelectedIds(new Set());
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const filteredList = getFilteredTodos();
    const oldIndex = filteredList.findIndex(t => t.id === active.id);
    const newIndex = filteredList.findIndex(t => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    // Calculate new position
    let newPosition: number;
    if (newIndex === 0) {
      newPosition = (filteredList[0]?.position ?? 1000) - 1000;
    } else if (newIndex >= filteredList.length - 1) {
      newPosition = (filteredList[filteredList.length - 1]?.position ?? 0) + 1000;
    } else {
      const before = filteredList[newIndex > oldIndex ? newIndex : newIndex - 1];
      const after = filteredList[newIndex > oldIndex ? newIndex + 1 : newIndex];
      newPosition = Math.round(((before?.position ?? 0) + (after?.position ?? 0)) / 2);
    }

    const draggedTodo = filteredList[oldIndex];
    const items = [{ id: draggedTodo.id, position: newPosition, groupId: draggedTodo.groupId }];

    // Optimistic update
    setTodos(prev => {
      const updated = prev.map(t => t.id === draggedTodo.id ? { ...t, position: newPosition } : t);
      return updated.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    });

    try {
      await reorderTodos(items);
    } catch (err) {
      console.error('Failed to reorder:', err);
      await loadTodos();
    }
  };

  const getFilteredTodos = () => {
    return todos.filter(t => {
      if (filter === 'active' && t.completed) return false;
      if (filter === 'done' && !t.completed) return false;
      if (groupFilter === 'ungrouped' && t.groupId) return false;
      if (groupFilter !== 'all' && groupFilter !== 'ungrouped' && t.groupId !== groupFilter) return false;
      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  };

  const filtered = getFilteredTodos();
  const activeCount = todos.filter(t => !t.completed).length;

  // Group sections for "All" view
  const groupSections = groupFilter === 'all' && groups.length > 0
    ? (() => {
        const sections: { groupId: string | null; label: string; items: TodoItemType[] }[] = [];
        const grouped = new Map<string | null, TodoItemType[]>();
        for (const todo of filtered) {
          const key = todo.groupId ?? null;
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(todo);
        }
        // Groups in order
        for (const g of groups) {
          const items = grouped.get(g.id);
          if (items && items.length > 0) sections.push({ groupId: g.id, label: g.name, items });
        }
        // Ungrouped at end
        const ungrouped = grouped.get(null);
        if (ungrouped && ungrouped.length > 0) sections.push({ groupId: null, label: 'Ungrouped', items: ungrouped });
        return sections;
      })()
    : null;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">Todos</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSelect(null)}
            className="text-xs px-3 py-1.5 bg-claude text-white rounded-lg hover:bg-claude-hover transition-colors"
          >
            + New
          </button>
        </div>
      </div>

      {/* Filter pills */}
      <div className="px-4 py-2 border-b border-gray-800 flex gap-1">
        {(['all', 'active', 'done'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1 rounded-full capitalize transition-colors ${
              filter === f
                ? 'bg-claude text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {f}{f === 'active' ? ` (${activeCount})` : ''}
          </button>
        ))}
      </div>

      {/* Group pills */}
      {groups.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setGroupFilter('all')}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              groupFilter === 'all' ? 'bg-claude text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setGroupFilter('ungrouped')}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
              groupFilter === 'ungrouped' ? 'bg-claude text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            Ungrouped
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setGroupFilter(g.id)}
              onContextMenu={e => {
                e.preventDefault();
                // Right-click on group pill handled by GroupManager
              }}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                groupFilter === g.id ? 'bg-claude text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {g.name}
            </button>
          ))}
          <button
            onClick={() => setShowGroupManager(!showGroupManager)}
            className="text-xs px-2 py-1 rounded-full text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
            title="Manage groups"
          >
            {showGroupManager ? '×' : '+'}
          </button>
        </div>
      )}

      {/* Group manager (inline) */}
      {(showGroupManager || groups.length === 0) && (
        <div className="px-4 py-2 border-b border-gray-800 bg-gray-900/50">
          <GroupManager groups={groups} onGroupsChanged={loadGroups} />
          {groups.length > 0 && (
            <button
              onClick={() => setShowGroupManager(false)}
              className="mt-1 text-xs text-gray-500 hover:text-gray-300"
            >
              Close
            </button>
          )}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-gray-500 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-gray-500 text-sm text-center">
              {filter === 'all'
                ? 'No todos yet. Create one to get started.'
                : filter === 'active'
                ? 'No active todos.'
                : 'No completed todos.'}
            </div>
          ) : groupSections ? (
            // Grouped view
            groupSections.map(section => {
              const groupKey = section.groupId ?? 'ungrouped';
              const isCollapsed = collapsedGroups.has(groupKey);
              return (
                <div key={groupKey}>
                  <button
                    onClick={() => toggleGroupCollapsed(groupKey)}
                    className="w-full px-4 py-1.5 text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-900/30 border-b border-gray-800/50 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
                  >
                    <span>{section.label} ({section.items.length})</span>
                    <span className="text-gray-600">{isCollapsed ? '▸' : '▾'}</span>
                  </button>
                  {!isCollapsed && (
                    <SortableContext items={section.items.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      {section.items.map(todo => {
                        const session = todo.sessionId ? sessionStatusMap.get(todo.sessionId) : undefined;
                        return (
                          <TodoItem
                            key={todo.id}
                            todo={todo}
                            selected={todo.id === selectedTodoId}
                            multiSelected={selectedIds.has(todo.id)}
                            sessionStatus={session?.status}
                            onSelect={(e) => handleSelect(todo.id, e)}
                            onToggle={() => handleToggle(todo)}
                            onContextMenu={(e) => handleContextMenu(todo.id, e)}
                          />
                        );
                      })}
                    </SortableContext>
                  )}
                </div>
              );
            })
          ) : (
            // Flat view
            <SortableContext items={filtered.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {filtered.map(todo => {
                const session = todo.sessionId ? sessionStatusMap.get(todo.sessionId) : undefined;
                return (
                  <TodoItem
                    key={todo.id}
                    todo={todo}
                    selected={todo.id === selectedTodoId}
                    multiSelected={selectedIds.has(todo.id)}
                    sessionStatus={session?.status}
                    onSelect={(e) => handleSelect(todo.id, e)}
                    onToggle={() => handleToggle(todo)}
                    onContextMenu={(e) => handleContextMenu(todo.id, e)}
                  />
                );
              })}
            </SortableContext>
          )}
        </div>
      </DndContext>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] text-gray-500 uppercase tracking-wider">
            {contextMenu.todoIds.length} item{contextMenu.todoIds.length > 1 ? 's' : ''}
          </div>
          <button
            onClick={() => handleMoveToGroup(null)}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Remove from group
          </button>
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => handleMoveToGroup(g.id)}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
            >
              Move to: {g.name}
            </button>
          ))}
          <div className="border-t border-gray-700 mt-1 pt-1">
            {showNewGroupInput ? (
              <div className="px-3 py-1 flex gap-1">
                <input
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleCreateGroupFromContext();
                    if (e.key === 'Escape') { setShowNewGroupInput(false); setContextMenu(null); }
                  }}
                  autoFocus
                  placeholder="Group name..."
                  className="flex-1 text-xs bg-gray-900 text-gray-200 px-2 py-1 rounded border border-gray-600 outline-none focus:border-claude"
                />
                <button
                  onClick={handleCreateGroupFromContext}
                  className="text-xs px-2 py-1 bg-claude text-white rounded hover:bg-claude-hover"
                >
                  OK
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewGroupInput(true)}
                className="w-full text-left px-3 py-1.5 text-xs text-claude hover:bg-gray-700 transition-colors"
              >
                Create new group...
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
