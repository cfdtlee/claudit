import { useState, useRef, useEffect, memo } from 'react';
import { SessionSummary } from '../../types';
import { useSessionStore } from '../../stores/useSessionStore';
import { useUIStore } from '../../stores/useUIStore';
import { cn } from '../../lib/utils';
import { Pin, Crown, MoreHorizontal, Activity } from 'lucide-react';
import SessionContextMenu from './SessionContextMenu';

interface Props {
  session: SessionSummary;
  projectHash: string;
  isArchived?: boolean;
  multiSelected?: boolean;
  onMultiClick?: (e: React.MouseEvent, sessionId: string) => void;
  onContextMenu?: (e: React.MouseEvent, sessionId: string) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function SessionItem({ session, projectHash, isArchived, multiSelected, onMultiClick, onContextMenu }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useUIStore(s => s.selected);
  const selectSession = useUIStore(s => s.selectSession);
  const setSelectedTaskId = useUIStore(s => s.setSelectedTaskId);
  const setView = useUIStore(s => s.setView);
  const renameSession = useSessionStore(s => s.renameSession);
  const pinSession = useSessionStore(s => s.pinSession);
  const archiveSession = useSessionStore(s => s.archiveSession);
  const unarchiveSession = useSessionStore(s => s.unarchiveSession);
  const deleteSession = useSessionStore(s => s.deleteSession);

  const isSelected = selected?.sessionId === session.sessionId;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      e.preventDefault();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (onMultiClick) {
      onMultiClick(e, session.sessionId);
    } else {
      selectSession(projectHash, session.sessionId, session.projectPath, undefined, session.slug, session.slugSessionIds);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (onContextMenu) {
      onContextMenu(e, session.sessionId);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditValue(session.displayName || session.lastMessage);
    setEditing(true);
  };

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== session.lastMessage) {
      renameSession(session.sessionId, trimmed);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') setEditing(false);
  };

  const handleAddTask = () => {
    setShowMenu(false);
    setSelectedTaskId(null);
    setView('tasks');
  };

  const displayText = session.displayName || session.lastMessage;

  return (
    <div
      className={cn(
        'group relative w-full text-left transition-all cursor-pointer',
        (multiSelected || (isSelected && !multiSelected)) ? 'list-item-selected' : 'list-item-hover'
      )}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="px-3 py-2.5">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
            className="w-full text-sm bg-secondary text-foreground px-2 py-1 rounded-md border border-primary/30 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
          />
        ) : (
          <div className="flex items-center gap-2">
            {session.status === 'running' && (
              <Activity className="w-3.5 h-3.5 text-blue-400 animate-pulse flex-shrink-0" />
            )}
            {session.status === 'done' && (
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            )}
            {session.isMayor ? (
              <Crown className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            ) : session.pinned ? (
              <Pin className="w-3 h-3 text-primary flex-shrink-0" />
            ) : null}
            <div className={cn(
              'text-sm truncate leading-snug flex-1',
              isSelected ? 'text-foreground' : 'text-secondary-foreground'
            )}>
              {displayText}
            </div>
            <button
              onClick={e => {
                e.stopPropagation();
                if (multiSelected && onContextMenu) {
                  onContextMenu(e, session.sessionId);
                } else {
                  setShowMenu(!showMenu);
                }
              }}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all px-0.5 flex-shrink-0"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-1 ml-5">
          {formatTime(session.timestamp)}
        </div>
      </div>
      {showMenu && (
        <SessionContextMenu
          isArchived={isArchived}
          isPinned={session.pinned}
          onRename={() => {
            setShowMenu(false);
            setEditValue(session.displayName || session.lastMessage);
            setEditing(true);
          }}
          onPin={() => {
            setShowMenu(false);
            pinSession(session.sessionId);
          }}
          onAddTask={handleAddTask}
          onArchive={() => {
            setShowMenu(false);
            if (isArchived) unarchiveSession(session.sessionId);
            else archiveSession(session.sessionId);
          }}
          onDelete={() => {
            setShowMenu(false);
            deleteSession(session.sessionId);
          }}
          onClose={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}

export default memo(SessionItem);
