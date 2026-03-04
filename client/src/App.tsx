import { useEffect, useCallback } from 'react';
import { Toaster } from 'sonner';
import Layout from './components/Layout';
import NavSidebar from './components/NavSidebar';
import { useSystemNotifications } from './hooks/useSystemNotifications';
import SessionList from './components/SessionList/SessionList';
import SessionDetail from './components/SessionDetail/SessionDetail';
import EmptyState from './components/SessionDetail/EmptyState';
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

  const selectSession = useUIStore(s => s.selectSession);
  const createSession = useSessionStore(s => s.createSession);
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
        return <TaskList selectedTaskId={selectedTaskId} onSelect={setSelectedTaskId} />;
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
        return selected ? (
          <SessionDetail
            projectHash={selected.projectHash}
            sessionId={selected.sessionId}
            projectPath={selected.projectPath}
            isNew={selected.isNew}
            slug={selected.slug}
            slugSessionIds={selected.slugSessionIds}
          />
        ) : (
          <EmptyState onCreateSession={handleCreateFromEmpty} />
        );
      case 'cron':
        return <CronTaskDetail taskId={selectedCronTaskId} onTaskDeleted={() => setSelectedCronTaskId(null)} />;
      case 'tasks':
        return (
          <TaskDetail
            taskId={selectedTaskId}
            onTaskDeleted={() => setSelectedTaskId(null)}
            onTaskCreated={(id) => setSelectedTaskId(id)}
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
      <Layout
        nav={<NavSidebar />}
        sidebar={renderSidebar()}
        main={renderMain()}
      />
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
