import { useUIStore, View } from '../stores/useUIStore';

// Re-export for backward compat
export type { View };

export default function NavSidebar() {
  const view = useUIStore(s => s.view);
  const setView = useUIStore(s => s.setView);

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setView('todo')}
        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
          view === 'todo'
            ? 'bg-claude text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }`}
        title="Todos"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </button>
      <button
        onClick={() => setView('sessions')}
        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
          view === 'sessions'
            ? 'bg-claude text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }`}
        title="Sessions"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <button
        onClick={() => setView('cron')}
        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
          view === 'cron'
            ? 'bg-claude text-white'
            : 'text-gray-400 hover:text-white hover:bg-gray-800'
        }`}
        title="Workflows"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="16" width="7" height="5" rx="1" />
          <path d="M10 5.5h2a2 2 0 0 1 2 2v7a2 2 0 0 0 2 2h-2" />
          <polyline points="14 14.5 16 16.5 14 18.5" />
        </svg>
      </button>
    </div>
  );
}
