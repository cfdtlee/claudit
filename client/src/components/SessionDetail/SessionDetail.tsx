import { useState, useEffect, lazy, Suspense } from 'react';
import { SessionDetail as SessionDetailType, TodoItem } from '../../types';
import { fetchSessionDetail, markSessionSeen } from '../../api/sessions';
import { fetchTodos } from '../../api/todo';
import { useUIStore } from '../../stores/useUIStore';
import EmptyState from './EmptyState';

const TerminalView = lazy(() => import('./TerminalView'));
const ConversationView = lazy(() => import('./ConversationView'));

type Tab = 'terminal' | 'history';

interface Props {
  projectHash: string;
  sessionId: string;
  projectPath: string;
  isNew?: boolean;
  slug?: string;
  slugSessionIds?: string[];
}

export default function SessionDetail({ projectHash, sessionId, projectPath, isNew, slug, slugSessionIds }: Props) {
  const [detail, setDetail] = useState<SessionDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('terminal');
  const [linkedTodo, setLinkedTodo] = useState<TodoItem | null>(null);
  const [showIdPopover, setShowIdPopover] = useState(false);
  const [copied, setCopied] = useState(false);

  const setView = useUIStore(s => s.setView);
  const setSelectedTodoId = useUIStore(s => s.setSelectedTodoId);

  const hasMergedHistory = !!(slug && slugSessionIds && slugSessionIds.length > 1);

  // Reset tab when session changes
  useEffect(() => {
    setActiveTab('terminal');
    setShowIdPopover(false);
  }, [sessionId]);

  // Load session header info when selection changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchSessionDetail(projectHash, sessionId)
      .then(data => {
        if (!cancelled) {
          setDetail(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    // Mark session as seen (done → idle transition)
    markSessionSeen(sessionId).catch(() => {});

    return () => { cancelled = true; };
  }, [projectHash, sessionId]);

  // Load linked todo
  useEffect(() => {
    let cancelled = false;
    fetchTodos().then(todos => {
      if (!cancelled) {
        const found = todos.find(t => t.sessionId === sessionId);
        setLinkedTodo(found ?? null);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionId]);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const handleJumpToTodo = () => {
    if (linkedTodo) {
      setSelectedTodoId(linkedTodo.id);
      setView('todo');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        Loading session...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  if (!detail) return <EmptyState />;

  const displayTitle = linkedTodo
    ? linkedTodo.title
    : detail.projectPath.split('/').pop() || detail.sessionId;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-3 bg-gray-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm font-medium text-gray-200 truncate">
            {displayTitle}
          </div>
          {/* Info button for session ID */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowIdPopover(!showIdPopover)}
              className="w-4 h-4 rounded-full border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-400 flex items-center justify-center text-[9px] font-medium transition-colors"
              title="Session info"
            >
              i
            </button>
            {showIdPopover && (
              <div className="absolute left-0 top-7 z-20 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-2.5 min-w-[280px]">
                <div className="text-[10px] text-gray-500 mb-1">Session ID</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-gray-300 font-mono flex-1 truncate">{sessionId}</code>
                  <button
                    onClick={handleCopyId}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Jump to linked todo */}
          {linkedTodo && (
            <button
              onClick={handleJumpToTodo}
              className="text-xs px-2 py-1 rounded-md text-claude hover:bg-gray-800 transition-colors flex items-center gap-1"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Task
            </button>
          )}

          {/* Tab switcher — only shown for merged sessions */}
          {hasMergedHistory && (
            <div className="flex gap-1 bg-gray-800/50 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('terminal')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  activeTab === 'terminal'
                    ? 'bg-gray-700 text-gray-200'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Terminal
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  activeTab === 'history'
                    ? 'bg-gray-700 text-gray-200'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                History
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'terminal' ? (
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Loading terminal...
          </div>
        }>
          <TerminalView sessionId={sessionId} projectPath={projectPath} isNew={isNew} />
        </Suspense>
      ) : (
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Loading conversation...
          </div>
        }>
          <ConversationView projectHash={projectHash} slug={slug!} />
        </Suspense>
      )}
    </div>
  );
}
