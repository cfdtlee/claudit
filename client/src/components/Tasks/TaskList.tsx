import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Task, TaskStatus } from '../../types';
import { fetchTasks, updateTask, reorderTasks } from '../../api/tasks';
import { cn } from '../../lib/utils';
import {
  Search, X, Plus, Circle, CheckCircle2, Clock, AlertTriangle,
  Loader2, FileText, Pause, Ban, Bell,
} from 'lucide-react';
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
  1: 'bg-muted-foreground/40',
  2: 'bg-amber-400',
  3: 'bg-red-400',
};

const STATUS_ICONS: Record<TaskStatus, React.ElementType> = {
  pending: Circle,
  running: Loader2,
  waiting: Bell,
  draft: FileText,
  paused: Pause,
  done: CheckCircle2,
  failed: AlertTriangle,
  cancelled: Ban,
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'text-muted-foreground',
  running: 'text-blue-400',
  waiting: 'text-red-400',
  draft: 'text-purple-400',
  paused: 'text-amber-400',
  done: 'text-emerald-400',
  failed: 'text-red-400',
  cancelled: 'text-muted-foreground/50',
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
  const isRunning = task.status === 'running';
  const timeAgo = getTimeAgo(task.createdAt);
  const StatusIcon = STATUS_ICONS[task.status] ?? Circle;

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
      className={cn(
        'px-3 py-3 cursor-pointer transition-all flex items-start gap-3',
        isWaiting && !selected && 'border-l-2 border-l-red-400 bg-red-500/5',
        isRunning && !selected && 'border-l-2 border-l-blue-400 bg-blue-500/5',
        selected ? 'list-item-selected' : 'list-item-hover'
      )}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={cn(
          'mt-0.5 w-[18px] h-[18px] rounded-full flex-shrink-0 flex items-center justify-center transition-all',
          isDone
            ? 'bg-primary text-primary-foreground'
            : 'border border-muted-foreground/40 hover:border-primary/60'
        )}
      >
        {isDone && <CheckCircle2 className="w-3 h-3" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            PRIORITY_COLORS[task.priority ?? 2] ?? 'bg-muted-foreground/40'
          )} />
          <span className={cn(
            'text-sm truncate',
            isDone ? 'text-muted-foreground line-through' : 'text-foreground'
          )}>
            {task.title}
          </span>
          {(isWaiting || isRunning) && (
            <StatusIcon className={cn(
              'w-3.5 h-3.5 flex-shrink-0',
              STATUS_COLORS[task.status],
              isRunning && 'animate-spin'
            )} />
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 ml-3.5">{timeAgo}</div>
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
      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Tasks</h2>
        <button
          onClick={() => onSelect('')}
          className="text-xs px-3 py-1.5 rounded-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm shadow-primary/20 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> New
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            data-search-input
            placeholder="Search tasks..."
            value={localSearchQuery}
            onChange={e => {
              setLocalSearchQuery(e.target.value);
              if (!composingRef.current) setSearchQuery(e.target.value);
            }}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={e => {
              composingRef.current = false;
              const val = (e.target as HTMLInputElement).value;
              setLocalSearchQuery(val);
              setSearchQuery(val);
            }}
            className="w-full pl-8 pr-7 py-2 rounded-lg bg-secondary/50 text-foreground text-sm
                       placeholder-muted-foreground border border-border/50 focus:border-primary/50
                       focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
          />
          {localSearchQuery && (
            <button
              onClick={() => { setLocalSearchQuery(''); setSearchQuery(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filter pills */}
      <div className="px-3 py-1.5 flex gap-1">
        {(['all', 'active', 'done'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'text-xs px-3 py-1 rounded-full capitalize transition-all font-medium',
              filter === f
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            {f}{f === 'active' ? ` (${activeCount})` : ''}
          </button>
        ))}
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex-1 sidebar-scroll">
          {loading ? (
            <div className="p-6 flex justify-center">
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-muted-foreground text-sm text-center">
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
