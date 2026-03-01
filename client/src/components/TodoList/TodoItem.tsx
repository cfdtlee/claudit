import { TodoItem as TodoItemType } from '../../types';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { StatusDot, StatusType } from '../StatusDot';

const priorityColors = {
  low: 'bg-gray-500',
  medium: 'bg-yellow-500',
  high: 'bg-red-500',
};

interface Props {
  todo: TodoItemType;
  selected: boolean;
  multiSelected?: boolean;
  sessionStatus?: 'idle' | 'running' | 'done';
  onSelect: (e: React.MouseEvent) => void;
  onToggle: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

import { memo } from 'react';

function TodoItem({ todo, selected, multiSelected, sessionStatus, onSelect, onToggle, onContextMenu }: Props) {
  const timeAgo = getTimeAgo(todo.createdAt);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

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
      onContextMenu={onContextMenu}
      className={`px-4 py-3 border-b border-gray-800 cursor-pointer transition-colors flex items-start gap-3 ${
        selected ? 'bg-gray-800' : multiSelected ? 'bg-gray-800/70' : 'hover:bg-gray-800/50'
      }${multiSelected ? ' ring-1 ring-claude/30' : ''}`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
          todo.completed
            ? 'bg-claude border-claude'
            : 'border-gray-500 hover:border-gray-300'
        }`}
      >
        {todo.completed && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityColors[todo.priority]}`} />
          <span className={`text-sm truncate ${
            todo.completed ? 'text-gray-500 line-through' : 'text-gray-200'
          }`}>
            {todo.title}
          </span>
          {sessionStatus && (
            <StatusDot status={sessionStatus as StatusType} title={`Session: ${sessionStatus}`} />
          )}
        </div>
        <div className="text-xs text-gray-500 mt-1 ml-4">{timeAgo}</div>
      </div>
    </div>
  );
}

export default memo(TodoItem);

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
