import { useUIStore, View } from '../stores/useUIStore';
import { useNavCollapsed, useSidebarToggle } from './Layout';
import { cn } from '../lib/utils';
import {
  LayoutDashboard,
  Layers,
  MessageSquare,
  Workflow,
  Bot,
  Settings,
  Github,
} from 'lucide-react';

export type { View };

interface NavItem {
  view: View;
  label: string;
  icon: React.ElementType;
  bottom?: boolean;
}

const navItems: NavItem[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'tasks', label: 'Tasks', icon: Layers },
  { view: 'sessions', label: 'Sessions', icon: MessageSquare },
  { view: 'cron', label: 'Cron Jobs', icon: Workflow },
  { view: 'agents', label: 'Agents', icon: Bot },
  { view: 'settings', label: 'Settings', icon: Settings, bottom: true },
];

function NavButton({ item, active, collapsed, onClick }: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex items-center py-2 rounded-lg text-sm font-medium overflow-hidden transition-all duration-150',
        collapsed ? 'justify-center px-2' : 'gap-2.5 px-3',
        active
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
      title={item.label}
    >
      <Icon className={cn(
        'flex-shrink-0 transition-colors',
        active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
      )} size={18} />
      <span className={cn(
        'truncate whitespace-nowrap transition-all duration-150',
        collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
      )}>
        {item.label}
      </span>
    </button>
  );
}

// Views that have a sidebar list panel
const viewsWithSidebar: View[] = ['sessions', 'cron', 'tasks', 'agents'];

export default function NavSidebar() {
  const view = useUIStore(s => s.view);
  const setView = useUIStore(s => s.setView);
  const collapsed = useNavCollapsed();
  const { hidden: sidebarHidden, toggle: toggleSidebar } = useSidebarToggle();

  const mainItems = navItems.filter(i => !i.bottom);
  const bottomItems = navItems.filter(i => i.bottom);

  const handleNavClick = (targetView: View) => {
    if (targetView === view && sidebarHidden && viewsWithSidebar.includes(targetView)) {
      // Re-click active view with hidden sidebar → show sidebar
      toggleSidebar();
    } else {
      setView(targetView);
    }
  };

  return (
    <div className="flex flex-col justify-between h-full gap-2">
      {/* Logo / brand */}
      <div className={cn(
        'flex items-center mb-2 overflow-hidden',
        collapsed ? 'justify-center px-2' : 'gap-2 px-3'
      )}>
        <div
          className="w-8 h-8 flex items-center justify-center flex-shrink-0 relative"
          style={{
            borderRadius: '9px',
            background: 'linear-gradient(180deg, #C4623F 0%, #E8A070 100%)',
            boxShadow: 'inset 0 0 0 1.5px rgba(255,255,255,0.18), 0 2px 6px rgba(0,0,0,0.3)',
          }}
        >
          <span className="text-white font-bold text-sm" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>C</span>
        </div>
        <span className={cn(
          'font-semibold text-foreground text-sm tracking-tight whitespace-nowrap transition-all duration-150',
          collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
        )}>
          Claudit
        </span>
      </div>

      {/* Main nav */}
      <div className="flex flex-col gap-0.5 flex-1">
        {mainItems.map(item => (
          <NavButton
            key={item.view}
            item={item}
            active={view === item.view}
            collapsed={collapsed}
            onClick={() => handleNavClick(item.view)}
          />
        ))}
      </div>

      {/* Bottom nav */}
      <div className="flex flex-col gap-0.5">
        <a
          href="https://github.com/cfdtlee/claudit"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'group relative flex items-center py-2 rounded-lg text-sm font-medium overflow-hidden transition-all duration-150 text-muted-foreground hover:text-foreground hover:bg-accent',
            collapsed ? 'justify-center px-2' : 'gap-2.5 px-3'
          )}
          title="GitHub"
        >
          <Github className="flex-shrink-0 transition-colors text-muted-foreground group-hover:text-foreground" size={18} />
          <span className={cn(
            'truncate whitespace-nowrap transition-all duration-150',
            collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
          )}>
            GitHub
          </span>
        </a>
        {bottomItems.map(item => (
          <NavButton
            key={item.view}
            item={item}
            active={view === item.view}
            collapsed={collapsed}
            onClick={() => handleNavClick(item.view)}
          />
        ))}
      </div>
    </div>
  );
}
