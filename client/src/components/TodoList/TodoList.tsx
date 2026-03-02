import { useState, useEffect, useCallback, useRef } from 'react';
import { TodoItem as TodoItemType, SessionSummary } from '../../types';
import { fetchTodos, updateTodo, reorderTodos } from '../../api/todo';
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

type Filter = 'all' | 'active' | 'done';

interface Props {
  selectedTodoId: string | null;
  onSelect: (id: string | null) => void;
}

export default function TodoList({ selectedTodoId, onSelect }: Props) {
  const [todos, setTodos] = useState<TodoItemType[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const composingRef = useRef(false);

  const todoSessionPrefill = useUIStore(s => s.todoSessionPrefill);
  const setTodoSessionPrefill = useUIStore(s => s.setTodoSessionPrefill);

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
    loadSessions();
    const interval = setInterval(loadTodos, 10000);
    return () => clearInterval(interval);
  }, [loadTodos, loadSessions]);

  // Refresh list when selection changes (e.g. after creation)
  useEffect(() => {
    if (selectedTodoId) loadTodos();
  }, [selectedTodoId, loadTodos]);

  // Watch for session→todo prefill
  useEffect(() => {
    if (todoSessionPrefill) {
      onSelect(null);
    }
  }, [todoSessionPrefill, onSelect]);

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
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !(t.description?.toLowerCase().includes(q) ?? false)) return false;
      }
      return true;
    }).sort((a, b) => {
      // Completed todos sort below open todos
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  };

  const filtered = getFilteredTodos();
  const activeCount = todos.filter(t => !t.completed).length;

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

      {/* Search */}
      <div className="p-3 border-b border-gray-800">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            data-search-input
            placeholder="Search todos..."
            value={localSearchQuery}
            onChange={e => {
              setLocalSearchQuery(e.target.value);
              if (!composingRef.current) {
                setSearchQuery(e.target.value);
              }
            }}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={e => {
              composingRef.current = false;
              const val = (e.target as HTMLInputElement).value;
              setLocalSearchQuery(val);
              setSearchQuery(val);
            }}
            className="w-full pl-8 pr-7 py-2 rounded-md bg-gray-800 text-gray-200 text-sm
                       placeholder-gray-500 border border-gray-700 focus:border-blue-500
                       focus:outline-none transition-colors"
          />
          {localSearchQuery && (
            <button
              onClick={() => { setLocalSearchQuery(''); setSearchQuery(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
            >
              ✕
            </button>
          )}
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
          ) : (
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
                    onContextMenu={() => {}}
                  />
                );
              })}
            </SortableContext>
          )}
        </div>
      </DndContext>

    </div>
  );
}
