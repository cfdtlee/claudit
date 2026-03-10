import { useState, useEffect, useCallback } from 'react';
import { Toaster } from 'sonner';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, DragStartEvent, DragEndEvent } from '@dnd-kit/core';
import Layout from './components/Layout';
import NavSidebar from './components/NavSidebar';
import { useSystemNotifications } from './hooks/useSystemNotifications';
import SessionList from './components/SessionList/SessionList';
import SplitPaneContainer from './components/SessionDetail/SplitPaneContainer';
import CronTaskList from './components/CronTasks/CronTaskList';
import CronTaskDetail from './components/CronTasks/CronTaskDetail';
import TaskList from './components/Tasks/TaskList';
import TaskDetail from './components/Tasks/TaskDetail';
import AgentList from './components/Agents/AgentList';
import AgentDetail from './components/Agents/AgentDetail';
import SettingsPage from './components/Settings/SettingsPage';
import DashboardPage from './components/Dashboard/DashboardPage';
import { useUIStore } from './stores/useUIStore';
import { useSessionStore } from './stores/useSessionStore';
import { usePaneStore } from './stores/usePaneStore';
import { getDropZone } from './components/SessionDetail/PaneLeaf';
import { requestNotificationPermission } from './utils/notifications';

export default function App() {
  const view = useUIStore(s => s.view);
  const selected = useUIStore(s => s.selected);
  const selectedCronTaskId = useUIStore(s => s.selectedCronTaskId);
  const setSelectedCronTaskId = useUIStore(s => s.setSelectedCronTaskId);
  const selectedTaskId = useUIStore(s => s.selectedTaskId);
  const setSelectedTaskId = useUIStore(s => s.setSelectedTaskId);
  const selectedAgentId = useUIStore(s => s.selectedAgentId);
  const setSelectedAgentId = useUIStore(s => s.setSelectedAgentId);

  const [taskRefreshTrigger, setTaskRefreshTrigger] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragLabel, setDragLabel] = useState('');

  const selectSession = useUIStore(s => s.selectSession);
  const createSession = useSessionStore(s => s.createSession);
  const paneRoot = usePaneStore(s => s.root);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );
  const connectEventStream = useSessionStore(s => s.connectEventStream);
  const disconnectEventStream = useSessionStore(s => s.disconnectEventStream);

  useEffect(() => {
    requestNotificationPermission();
    connectEventStream();
    return () => disconnectEventStream();
  }, [connectEventStream, disconnectEventStream]);

  // Global keyboard shortcuts
  // Cmd+K or '/' — focus search | 'n' — new item (when not in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable;

      // Cmd/Ctrl+K — focus search (works even in input)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.querySelector('[data-search-input]') as HTMLInputElement;
        input?.focus();
        return;
      }

      // Skip single-key shortcuts when typing in an input
      if (inInput) return;

      // '/' — focus search
      if (e.key === '/') {
        e.preventDefault();
        const input = document.querySelector('[data-search-input]') as HTMLInputElement;
        input?.focus();
      }

      // 'n' — new item in current view
      if (e.key === 'n') {
        e.preventDefault();
        const currentView = useUIStore.getState().view;
        if (currentView === 'sessions') {
          useUIStore.getState().clearSelected();
        } else if (currentView === 'tasks') {
          useUIStore.getState().setSelectedTaskId(null);
        } else if (currentView === 'agents') {
          useUIStore.getState().setSelectedAgentId(null);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Sync UIStore.selected -> active pane session
  useEffect(() => {
    if (view !== 'sessions' || !selected) return;
    usePaneStore.getState().setSessionInActivePane({
      projectHash: selected.projectHash,
      sessionId: selected.sessionId,
      projectPath: selected.projectPath,
      isNew: selected.isNew,
      slug: selected.slug,
      slugSessionIds: selected.slugSessionIds,
    });
  }, [selected, view]);

  // Sync active pane -> UIStore.selected
  useEffect(() => {
    if (view !== 'sessions') return;
    return usePaneStore.subscribe((state, prevState) => {
      if (state.activePaneId !== prevState.activePaneId) {
        const session = state.getActiveSession();
        if (session) {
          selectSession(session.projectHash, session.sessionId, session.projectPath, session.isNew, session.slug, session.slugSessionIds);
        }
      }
    });
  }, [view, selectSession]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setIsDragging(true);
    const data = event.active.data.current;
    if (data?.type === 'session') {
      setDragLabel(data.displayText || data.sessionId?.slice(0, 8) || 'Session');
    } else if (data?.type === 'pane' && data.session) {
      // Find display name from session store
      const groups = useSessionStore.getState().groups;
      let label = data.session.sessionId?.slice(0, 8) || 'Session';
      for (const g of groups) {
        const found = g.sessions.find((s: any) => s.sessionId === data.session.sessionId);
        if (found) { label = found.displayName || found.lastMessage || label; break; }
      }
      setDragLabel(label);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setIsDragging(false);
    setDragLabel('');
    const { active, over } = event;
    if (!over) return;

    const dragData = active.data.current;
    const dropData = over.data.current;
    if (!dropData?.paneId) return;

    const zone = getDropZone(dropData.paneId) || 'right';

    // Drag from session list
    if (dragData?.type === 'session') {
      const session = {
        projectHash: dragData.projectHash,
        sessionId: dragData.sessionId,
        projectPath: dragData.projectPath,
        slug: dragData.slug,
        slugSessionIds: dragData.slugSessionIds,
      };
      usePaneStore.getState().splitPane(dropData.paneId, zone, session);
    }

    // Drag from another pane
    if (dragData?.type === 'pane' && dragData.paneId !== dropData.paneId) {
      usePaneStore.getState().movePane(dragData.paneId, dropData.paneId, zone);
    }
  }, []);

  const handleCreateFromEmpty = useCallback(async (projectPath: string, initialPrompt?: string, worktree?: { branchName: string }, model?: string, permissionMode?: string): Promise<true | string> => {
    try {
      const result = await createSession(projectPath, { initialPrompt, worktree, model, permissionMode });
      if (result) {
        selectSession(result.projectHash, result.sessionId, result.projectPath, true);
        return true;
      }
      return 'Session creation failed';
    } catch (e: any) {
      return e.message || 'Session creation failed';
    }
  }, [createSession, selectSession]);

  const renderSidebar = () => {
    switch (view) {
      case 'dashboard':
        return null;
      case 'sessions':
        return <SessionList />;
      case 'cron':
        return <CronTaskList selectedTaskId={selectedCronTaskId} onSelect={setSelectedCronTaskId} />;
      case 'tasks':
        return <TaskList selectedTaskId={selectedTaskId} onSelect={setSelectedTaskId} refreshTrigger={taskRefreshTrigger} />;
      case 'agents':
        return <AgentList selectedAgentId={selectedAgentId} onSelect={setSelectedAgentId} />;
      case 'settings':
        return null;
      default:
        return null;
    }
  };

  const renderMain = () => {
    switch (view) {
      case 'dashboard':
        return <DashboardPage />;
      case 'sessions':
        return (
          <SplitPaneContainer
            node={paneRoot}
            isDragging={isDragging}
            onCreateSession={handleCreateFromEmpty}
          />
        );
      case 'cron':
        return <CronTaskDetail taskId={selectedCronTaskId} onTaskDeleted={() => setSelectedCronTaskId(null)} onTaskCreated={(id) => setSelectedCronTaskId(id)} />;
      case 'tasks':
        return (
          <TaskDetail
            taskId={selectedTaskId}
            onTaskDeleted={() => { setSelectedTaskId(null); setTaskRefreshTrigger(n => n + 1); }}
            onTaskCreated={(id) => { setSelectedTaskId(id); setTaskRefreshTrigger(n => n + 1); }}
            onTaskUpdated={() => setTaskRefreshTrigger(n => n + 1)}
          />
        );
      case 'agents':
        return (
          <AgentDetail
            agentId={selectedAgentId}
            onAgentDeleted={() => setSelectedAgentId(null)}
            onAgentCreated={(id) => setSelectedAgentId(id)}
          />
        );
      case 'settings':
        return <SettingsPage />;
      default:
        return null;
    }
  };

  useSystemNotifications();

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <Layout
          nav={<NavSidebar />}
          sidebar={renderSidebar()}
          main={renderMain()}
        />
        <DragOverlay dropAnimation={null}>
          {isDragging ? (
            <div className="px-3 py-2.5 bg-card/95 backdrop-blur-xl border border-primary/30 rounded-lg shadow-2xl shadow-black/40 text-sm text-foreground max-w-[260px] pointer-events-none">
              <div className="truncate leading-snug">{dragLabel}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        duration={10000}
        toastOptions={{
          style: {
            background: 'hsl(20 3% 9% / 0.95)',
            border: '1px solid hsl(20 3% 14% / 0.4)',
            color: 'hsl(20 2% 95%)',
            backdropFilter: 'blur(12px)',
          },
        }}
      />
    </>
  );
}
