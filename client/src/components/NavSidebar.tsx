import { useUIStore, View } from '../stores/useUIStore';
import { useNavCollapsed } from './Layout';

// Re-export for backward compat
export type { View };

interface NavItem {
  view: View;
  label: string;
  icon: JSX.Element;
  bottom?: boolean;
}

const navItems: NavItem[] = [
  {
    view: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    view: 'tasks',
    label: 'Tasks',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    view: 'sessions',
    label: 'Sessions',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    view: 'cron',
    label: 'Cron Jobs',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="16" width="7" height="5" rx="1" />
        <path d="M10 5.5h2a2 2 0 0 1 2 2v7a2 2 0 0 0 2 2h-2" />
        <polyline points="14 14.5 16 16.5 14 18.5" />
      </svg>
    ),
  },
  {
    view: 'agents',
    label: 'Agents',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    view: 'settings',
    label: 'Settings',
    bottom: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function NavSidebar() {
  const view = useUIStore(s => s.view);
  const setView = useUIStore(s => s.setView);
  const collapsed = useNavCollapsed();

  const mainItems = navItems.filter(i => !i.bottom);
  const bottomItems = navItems.filter(i => i.bottom);

  const btnClass = (active: boolean) =>
    `flex items-center ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'} py-2 rounded-lg text-sm font-medium transition-colors ${
      active
        ? 'bg-claude text-white'
        : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`;

  const labelClass = collapsed
    ? 'truncate overflow-hidden opacity-0 max-w-0 transition-all duration-150'
    : 'truncate overflow-hidden opacity-100 max-w-[120px] transition-all duration-150';

  return (
    <div className="flex flex-col justify-between h-full">
      <div className="flex flex-col gap-1">
        {mainItems.map(item => (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            className={btnClass(view === item.view)}
            title={item.label}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <span className={labelClass}>{item.label}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {bottomItems.map(item => (
          <button
            key={item.view}
            onClick={() => setView(item.view)}
            className={btnClass(view === item.view)}
            title={item.label}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <span className={labelClass}>{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
