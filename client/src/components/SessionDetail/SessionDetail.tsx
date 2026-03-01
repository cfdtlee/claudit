import { useState, useEffect, lazy, Suspense } from 'react';
import { SessionDetail as SessionDetailType } from '../../types';
import { fetchSessionDetail, markSessionSeen } from '../../api/sessions';
import EmptyState from './EmptyState';
import TerminalView from './TerminalView';

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

  const hasMergedHistory = !!(slug && slugSessionIds && slugSessionIds.length > 1);

  // Reset tab when session changes
  useEffect(() => {
    setActiveTab('terminal');
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-3 bg-gray-900 flex items-center justify-between shrink-0">
        <div>
          <div className="text-sm font-medium text-gray-200 truncate">
            {detail.projectPath.split('/').pop() || detail.sessionId}
          </div>
          <div className="text-xs text-gray-500 truncate">
            {detail.sessionId}
          </div>
        </div>

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

      {/* Content */}
      {activeTab === 'terminal' ? (
        <TerminalView sessionId={sessionId} projectPath={projectPath} isNew={isNew} />
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
