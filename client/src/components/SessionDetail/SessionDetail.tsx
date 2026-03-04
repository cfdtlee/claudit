import { useState, useEffect, lazy, Suspense } from 'react';
import { SessionDetail as SessionDetailType, Task } from '../../types';
import { fetchSessionDetail, markSessionSeen } from '../../api/sessions';
import { fetchTasks } from '../../api/tasks';
import { useUIStore } from '../../stores/useUIStore';
import { cn } from '../../lib/utils';
import { Info, ExternalLink, Terminal, History, Copy, Check, Loader2 } from 'lucide-react';
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
  const [linkedTask, setLinkedTask] = useState<Task | null>(null);
  const [showIdPopover, setShowIdPopover] = useState(false);
  const [copied, setCopied] = useState(false);

  const setView = useUIStore(s => s.setView);
  const setSelectedTaskId = useUIStore(s => s.setSelectedTaskId);

  const hasMergedHistory = !!(slug && slugSessionIds && slugSessionIds.length > 1);

  useEffect(() => {
    setActiveTab('terminal');
    setShowIdPopover(false);
  }, [sessionId]);

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

    markSessionSeen(sessionId).catch(() => {});
    return () => { cancelled = true; };
  }, [projectHash, sessionId]);

  useEffect(() => {
    let cancelled = false;
    fetchTasks().then(tasks => {
      if (!cancelled) {
        const found = tasks.find(t => t.sessionId === sessionId);
        setLinkedTask(found ?? null);
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

  const handleJumpToTask = () => {
    if (linkedTask) {
      setSelectedTaskId(linkedTask.id);
      setView('tasks');
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (error && !detail) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-border px-6 py-3 bg-card/50 shrink-0">
          <div className="text-sm font-medium text-foreground truncate font-mono">
            {sessionId.slice(0, 8)}...
          </div>
        </div>
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        }>
          <TerminalView sessionId={sessionId} projectPath={projectPath} />
        </Suspense>
      </div>
    );
  }

  if (!detail) return <EmptyState />;

  const displayTitle = linkedTask
    ? linkedTask.title
    : detail.projectPath.split('/').pop() || detail.sessionId;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-3 bg-card/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="text-sm font-medium text-foreground truncate">
            {displayTitle}
          </div>
          {/* Info button */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowIdPopover(!showIdPopover)}
              className="w-5 h-5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground flex items-center justify-center transition-colors"
              title="Session info"
            >
              <Info className="w-3 h-3" />
            </button>
            {showIdPopover && (
              <div className="absolute left-0 top-7 z-20 bg-popover border border-border rounded-lg shadow-xl p-3 min-w-[280px] animate-fade-in">
                <div className="text-[10px] text-muted-foreground mb-1.5 font-medium uppercase tracking-wider">Session ID</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-foreground font-mono flex-1 truncate bg-secondary/50 px-2 py-1 rounded">{sessionId}</code>
                  <button
                    onClick={handleCopyId}
                    className="text-xs px-2 py-1 rounded-md bg-secondary hover:bg-secondary/80 text-secondary-foreground transition-colors flex-shrink-0 flex items-center gap-1"
                  >
                    {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {linkedTask && (
            <button
              onClick={handleJumpToTask}
              className="text-xs px-2.5 py-1 rounded-md text-primary hover:bg-primary/10 transition-colors flex items-center gap-1 font-medium"
            >
              <ExternalLink className="w-3 h-3" /> Task
            </button>
          )}

          {hasMergedHistory && (
            <div className="flex gap-0.5 bg-secondary/50 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab('terminal')}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-all font-medium flex items-center gap-1',
                  activeTab === 'terminal'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Terminal className="w-3 h-3" /> Terminal
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={cn(
                  'px-3 py-1 text-xs rounded-md transition-all font-medium flex items-center gap-1',
                  activeTab === 'history'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <History className="w-3 h-3" /> History
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {activeTab === 'terminal' ? (
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        }>
          <TerminalView sessionId={sessionId} projectPath={projectPath} isNew={isNew} />
        </Suspense>
      ) : (
        <Suspense fallback={
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
          </div>
        }>
          <ConversationView projectHash={projectHash} slug={slug!} />
        </Suspense>
      )}
    </div>
  );
}
