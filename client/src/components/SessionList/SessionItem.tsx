import { useState, useRef, useEffect } from 'react';
import { SessionSummary } from '../../types';
import { useSessionStore } from '../../stores/useSessionStore';
import { useUIStore } from '../../stores/useUIStore';
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

export default function SessionItem({ session, projectHash, isArchived, multiSelected, onMultiClick, onContextMenu }: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useUIStore(s => s.selected);
  const selectSession = useUIStore(s => s.selectSession);
  const setTodoSessionPrefill = useUIStore(s => s.setTodoSessionPrefill);
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
    // Prevent text selection on shift/cmd+click
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
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  };

  const handleAddTodo = () => {
    setShowMenu(false);
    setTodoSessionPrefill({
      sessionId: session.sessionId,
      sessionLabel: session.displayName || session.lastMessage,
      projectPath: session.projectPath,
    });
    setView('todo');
  };

  const displayText = session.displayName || session.lastMessage;

  const statusEmoji = (() => {
    switch (session.status) {
      case 'running': return '\u{1F3C3}';
      case 'done': return '\u{1F514}';
      default: return null; // idle — no indicator
    }
  })();

  return (
    <div
      className={`group relative w-full text-left border-b border-gray-800/50 transition-colors cursor-pointer
        ${multiSelected ? 'bg-gray-800/70 ring-1 ring-claude/30' : ''}
        ${isSelected && !multiSelected ? 'bg-claude/10 border-l-2 border-l-claude' : ''}
        ${!isSelected && !multiSelected ? 'hover:bg-gray-800/50' : ''}`}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      <div className="px-4 py-2.5">
        {editing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            onClick={e => e.stopPropagation()}
            className="w-full text-sm bg-gray-800 text-gray-200 px-1.5 py-0.5 rounded border border-gray-600 outline-none focus:border-claude"
          />
        ) : (
          <div className="flex items-center gap-2">
            {statusEmoji && <span className="text-sm flex-shrink-0" title={session.status}>{statusEmoji}</span>}
            {session.pinned && (
              <svg className="w-3 h-3 text-claude flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
              </svg>
            )}
            <div className="text-sm text-gray-300 truncate leading-snug flex-1">
              {displayText}
            </div>
            <button
              onClick={e => {
                e.stopPropagation();
                if (multiSelected && onContextMenu) {
                  // When multi-selected, delegate to batch context menu
                  onContextMenu(e, session.sessionId);
                } else {
                  setShowMenu(!showMenu);
                }
              }}
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 transition-opacity px-1 text-sm flex-shrink-0"
            >
              ...
            </button>
          </div>
        )}
        <div className="text-xs text-gray-500 mt-1 ml-4">
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
          onAddTodo={handleAddTodo}
          onArchive={() => {
            setShowMenu(false);
            if (isArchived) {
              unarchiveSession(session.sessionId);
            } else {
              archiveSession(session.sessionId);
            }
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
