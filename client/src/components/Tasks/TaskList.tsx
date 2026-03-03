import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Task, TaskStatus } from '../../types';
import { fetchTasks, updateTask, reorderTasks } from '../../api/tasks';
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
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type Filter = 'all' | 'active' | 'done';

interface Props {
  selectedTaskId: string | null;
  onSelect: (taskId: string) => void;
}

const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-gray-500',
  2: 'bg-yellow-500',
  3: 'bg-red-500',
};

const STATUS_ICONS: Record<TaskStatus, string> = {
  pending: '\u25CB',
  running: '\u25D4',
  waiting: '\uD83D\uDD14',
  draft: '\uD83D\uDCDD',
  paused: '\u25D1',
  done: '\u25CF',
  failed: '\u2716',
  cancelled: '\u2014',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'text-gray-400',
  running: 'text-blue-400',
  waiting: 'text-red-400',
  draft: 'text-purple-400',
  paused: 'text-yellow-400',
  done: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-gray-600',
};

function getTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface TaskItemProps {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}

const TaskItem = memo(function TaskItem({ task, selected, onSelect, onToggle }: TaskItemProps) {
  const isDone = task.status === 'done';
  const isWaiting = task.status === 'waiting';
  const timeAgo = getTimeAgo(task.createdAt);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={`px-4 py-3 border-b cursor-pointer transition-colors flex items-start gap-3 ${
        isWaiting
          ? 'border-l-2 border-l-red-500 border-b-gray-800/50 bg-red-900/10'
          : 'border-b-gray-800/50'
      } ${
        selected ? 'bg-gray-800' : 'hover:bg-gray-800/50'
      }`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          isDone
            ? 'bg-claude border-claude'
            : 'border-gray-500 hover:border-gray-300'
        }`}
      >
        {isDone && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_COLORS[task.priority ?? 2] ?? 'bg-gray-500'}`} />
          <span className={`text-sm truncate ${
            isDone ? 'text-gray-500 line-through' : 'text-gray-200'
          }`}>
            {task.title}
          </span>
          {isWaiting && (
            <span className={`text-sm ${STATUS_COLORS.waiting}`}>{STATUS_ICONS.waiting}</span>
          )}
          {task.status === 'running' && (
            <span className={`text-xs ${STATUS_COLORS.running}`}>{STATUS_ICONS.running}</span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-1 ml-4">{timeAgo}</div>
      </div>
    </div>
  );
});

export default function TaskList({ selectedTaskId, onSelect }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const composingRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const loadTasks = useCallback(async () => {
    try {
      const data = await fetchTasks();
      setTasks(data);
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
    const interval = setInterval(loadTasks, 10000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // Refresh when selection changes
  useEffect(() => {
    if (selectedTaskId) loadTasks();
  }, [selectedTaskId, loadTasks]);

  const handleToggle = async (task: Task) => {
    const isDone = task.status === 'done';
    try {
      const updated = await updateTask(task.id, {
        status: isDone ? 'pending' : 'done',
        completedAt: isDone ? undefined : new Date().toISOString(),
      });
      setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const filteredList = getFilteredTasks();
    const oldIndex = filteredList.findIndex(t => t.id === active.id);
    const newIndex = filteredList.findIndex(t => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    let newOrder: number;
    if (newIndex === 0) {
      newOrder = (filteredList[0]?.order ?? 1000) - 1000;
    } else if (newIndex >= filteredList.length - 1) {
      newOrder = (filteredList[filteredList.length - 1]?.order ?? 0) + 1000;
    } else {
      const before = filteredList[newIndex > oldIndex ? newIndex : newIndex - 1];
      const after = filteredList[newIndex > oldIndex ? newIndex + 1 : newIndex];
      newOrder = Math.round(((before?.order ?? 0) + (after?.order ?? 0)) / 2);
    }

    const draggedTask = filteredList[oldIndex];
    const items = [{ id: draggedTask.id, order: newOrder }];

    // Optimistic update
    setTasks(prev => {
      const updated = prev.map(t => t.id === draggedTask.id ? { ...t, order: newOrder } : t);
      return updated.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    });

    try {
      await reorderTasks(items);
    } catch (err) {
      console.error('Failed to reorder:', err);
      await loadTasks();
    }
  };

  const getFilteredTasks = () => {
    return tasks.filter(t => {
      if (filter === 'active' && (t.status === 'done' || t.status === 'cancelled')) return false;
      if (filter === 'done' && t.status !== 'done') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!t.title.toLowerCase().includes(q) && !(t.description?.toLowerCase().includes(q) ?? false)) return false;
      }
      return true;
    }).sort((a, b) => {
      // Waiting tasks first, then done last
      if (a.status === 'waiting' && b.status !== 'waiting') return -1;
      if (a.status !== 'waiting' && b.status === 'waiting') return 1;
      const aDone = a.status === 'done' || a.status === 'cancelled';
      const bDone = b.status === 'done' || b.status === 'cancelled';
      if (aDone !== bDone) return aDone ? 1 : -1;
      return 0;
    });
  };

  const filtered = getFilteredTasks();
  const activeCount = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-200">Tasks</h2>
        <button
          onClick={() => onSelect('')}
          className="text-xs px-3 py-1.5 bg-claude text-white rounded-lg hover:bg-claude-hover transition-colors"
        >
          + New
        </button>
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
            placeholder="Search tasks..."
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
              &#x2715;
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
                ? 'No tasks yet. Create one to get started.'
                : filter === 'active'
                ? 'No active tasks.'
                : 'No completed tasks.'}
            </div>
          ) : (
            <SortableContext items={filtered.map(t => t.id)} strategy={verticalListSortingStrategy}>
              {filtered.map(task => (
                <TaskItem
                  key={task.id}
                  task={task}
                  selected={task.id === selectedTaskId}
                  onSelect={() => onSelect(task.id)}
                  onToggle={() => handleToggle(task)}
                />
              ))}
            </SortableContext>
          )}
        </div>
      </DndContext>
    </div>
  );
}
