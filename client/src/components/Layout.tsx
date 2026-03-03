import { ReactNode, useState, useCallback, useEffect, useRef } from 'react';

const SIDEBAR_STORAGE_KEY = 'claudit:sidebar-width';
const SIDEBAR_MIN = 200;
const SIDEBAR_MAX = 500;
const SIDEBAR_DEFAULT = 300;

const NAV_STORAGE_KEY = 'claudit:nav-width';
const NAV_MIN = 56;
const NAV_MAX = 180;
const NAV_DEFAULT = 56;
const NAV_COLLAPSE_THRESHOLD = 80;

function loadWidth(key: string, min: number, max: number, fallback: number): number {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      const n = Number(saved);
      if (n >= min && n <= max) return n;
    }
  } catch {}
  return fallback;
}

interface Props {
  nav: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
}

export default function Layout({ nav, sidebar, main }: Props) {
  const hasSidebar = sidebar != null;

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    loadWidth(SIDEBAR_STORAGE_KEY, SIDEBAR_MIN, SIDEBAR_MAX, SIDEBAR_DEFAULT)
  );
  const sidebarDragging = useRef(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;

  // Nav resize state
  const [navWidth, setNavWidth] = useState(() =>
    loadWidth(NAV_STORAGE_KEY, NAV_MIN, NAV_MAX, NAV_DEFAULT)
  );
  const navDragging = useRef(false);
  const navWidthRef = useRef(navWidth);
  navWidthRef.current = navWidth;

  const collapsed = navWidth < NAV_COLLAPSE_THRESHOLD;

  const onSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    sidebarDragging.current = true;
    document.body.classList.add('select-none');
  }, []);

  const onNavMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    navDragging.current = true;
    document.body.classList.add('select-none');
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (navDragging.current) {
        const newWidth = Math.min(NAV_MAX, Math.max(NAV_MIN, e.clientX));
        setNavWidth(newWidth);
        navWidthRef.current = newWidth;
      }
      if (sidebarDragging.current) {
        const offset = navWidthRef.current + 4; // nav + nav-divider
        const newWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, e.clientX - offset));
        setSidebarWidth(newWidth);
        sidebarWidthRef.current = newWidth;
      }
    };
    const onMouseUp = () => {
      if (navDragging.current) {
        navDragging.current = false;
        document.body.classList.remove('select-none');
        try { localStorage.setItem(NAV_STORAGE_KEY, String(navWidthRef.current)); } catch {}
      }
      if (sidebarDragging.current) {
        sidebarDragging.current = false;
        document.body.classList.remove('select-none');
        try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidthRef.current)); } catch {}
      }
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (navDragging.current || sidebarDragging.current) {
        document.body.classList.remove('select-none');
      }
    };
  }, []);

  const gridTemplate = hasSidebar
    ? `${navWidth}px 4px ${sidebarWidth}px 4px 1fr`
    : `${navWidth}px 4px 1fr`;

  return (
    <div
      className="h-screen grid"
      style={{ gridTemplateColumns: gridTemplate }}
    >
      <nav className="border-r border-gray-800 bg-gray-950 flex flex-col py-4 px-2 overflow-hidden">
        {typeof nav === 'object' && nav !== null && 'type' in (nav as any)
          ? <NavWrapper collapsed={collapsed}>{nav}</NavWrapper>
          : nav}
      </nav>
      {/* Nav resize divider */}
      <div
        onMouseDown={onNavMouseDown}
        className="cursor-col-resize bg-transparent hover:bg-blue-500/40 transition-colors"
      />
      {hasSidebar && (
        <>
          <aside className="border-r border-gray-800 overflow-y-auto bg-gray-900">
            {sidebar}
          </aside>
          <div
            onMouseDown={onSidebarMouseDown}
            className="cursor-col-resize bg-transparent hover:bg-blue-500/40 transition-colors"
          />
        </>
      )}
      <main className="overflow-hidden flex flex-col">
        {main}
      </main>
    </div>
  );
}

// Provides collapsed context to NavSidebar without coupling Layout to its internals
import { createContext, useContext } from 'react';

export const NavCollapsedContext = createContext(false);
export function useNavCollapsed() { return useContext(NavCollapsedContext); }

function NavWrapper({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  return (
    <NavCollapsedContext.Provider value={collapsed}>
      {children}
    </NavCollapsedContext.Provider>
  );
}
