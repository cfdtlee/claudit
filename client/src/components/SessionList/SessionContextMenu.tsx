import { useEffect, useRef } from 'react';

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

  const itemClass = 'w-full text-left px-3 py-1.5 text-xs hover:bg-gray-700 transition-colors';

  return (
    <div
      ref={ref}
      className="absolute right-2 top-8 z-50 bg-gray-800 border border-gray-700 rounded-md shadow-lg py-1 min-w-[120px]"
    >
      {!isArchived && (
        <button onClick={onRename} className={`${itemClass} text-gray-300`}>
          Rename
        </button>
      )}
      {!isArchived && (
        <button onClick={onPin} className={`${itemClass} text-gray-300`}>
          {isPinned ? 'Unpin' : 'Pin to top'}
        </button>
      )}
      {!isArchived && (
        <button onClick={onAddTask} className={`${itemClass} text-gray-300`}>
          Add Task
        </button>
      )}
      <button onClick={onArchive} className={`${itemClass} text-gray-300`}>
        {isArchived ? 'Unarchive' : 'Archive'}
      </button>
      <button onClick={onDelete} className={`${itemClass} text-red-400 hover:bg-red-900/30`}>
        Delete
      </button>
    </div>
  );
}
