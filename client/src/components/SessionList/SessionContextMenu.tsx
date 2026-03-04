import { useEffect, useRef } from 'react';
import { cn } from '../../lib/utils';
import { Edit3, Pin, PinOff, Plus, Archive, ArchiveRestore, Trash2 } from 'lucide-react';

interface Props {
  isArchived?: boolean;
  isPinned?: boolean;
  onRename: () => void;
  onPin: () => void;
  onAddTask: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function SessionContextMenu({ isArchived, isPinned, onRename, onPin, onAddTask, onArchive, onDelete, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const itemClass = 'w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-2';

  return (
    <div
      ref={ref}
      className="absolute right-2 top-8 z-50 bg-popover border border-border rounded-lg shadow-xl py-1 min-w-[140px] animate-fade-in"
    >
      {!isArchived && (
        <button onClick={onRename} className={cn(itemClass, 'text-popover-foreground')}>
          <Edit3 className="w-3 h-3" /> Rename
        </button>
      )}
      {!isArchived && (
        <button onClick={onPin} className={cn(itemClass, 'text-popover-foreground')}>
          {isPinned ? <><PinOff className="w-3 h-3" /> Unpin</> : <><Pin className="w-3 h-3" /> Pin to top</>}
        </button>
      )}
      {!isArchived && (
        <button onClick={onAddTask} className={cn(itemClass, 'text-popover-foreground')}>
          <Plus className="w-3 h-3" /> Add Task
        </button>
      )}
      <button onClick={onArchive} className={cn(itemClass, 'text-popover-foreground')}>
        {isArchived ? <><ArchiveRestore className="w-3 h-3" /> Unarchive</> : <><Archive className="w-3 h-3" /> Archive</>}
      </button>
      <button onClick={onDelete} className={cn(itemClass, 'text-destructive')}>
        <Trash2 className="w-3 h-3" /> Delete
      </button>
    </div>
  );
}
