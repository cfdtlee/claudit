import { useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import NavSidebar from './components/NavSidebar';
import SessionList from './components/SessionList/SessionList';
import SessionDetail from './components/SessionDetail/SessionDetail';
import EmptyState from './components/SessionDetail/EmptyState';
import CronTaskList from './components/CronTasks/CronTaskList';
import CronTaskDetail from './components/CronTasks/CronTaskDetail';
import TodoList from './components/TodoList/TodoList';
import TodoDetail from './components/TodoList/TodoDetail';
import { useUIStore } from './stores/useUIStore';
import { useSessionStore } from './stores/useSessionStore';
import { requestNotificationPermission } from './utils/notifications';

export default function App() {
  const view = useUIStore(s => s.view);
  const selected = useUIStore(s => s.selected);
  const selectedCronTaskId = useUIStore(s => s.selectedCronTaskId);
  const setSelectedCronTaskId = useUIStore(s => s.setSelectedCronTaskId);
  const selectedTodoId = useUIStore(s => s.selectedTodoId);
  const setSelectedTodoId = useUIStore(s => s.setSelectedTodoId);

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
        } else if (currentView === 'todo') {
          useUIStore.getState().setSelectedTodoId(null);
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleCreateFromEmpty = useCallback(async (projectPath: string, initialPrompt?: string, worktree?: { branchName: string }): Promise<true | string> => {
    try {
      const result = await createSession(projectPath, { initialPrompt, worktree });
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
    if (view === 'todo') {
      return (
        <TodoList
          selectedTodoId={selectedTodoId}
          onSelect={setSelectedTodoId}
        />
      );
    }
    if (view === 'sessions') {
      return <SessionList />;
    }
    return (
      <CronTaskList
        selectedTaskId={selectedCronTaskId}
        onSelect={setSelectedCronTaskId}
      />
    );
  };

  const renderMain = () => {
    if (view === 'todo') {
      return (
        <TodoDetail
          todoId={selectedTodoId}
          onTodoDeleted={() => setSelectedTodoId(null)}
          onTodoCreated={(id) => setSelectedTodoId(id)}
        />
      );
    }
    if (view === 'sessions') {
      return selected ? (
        <SessionDetail
          projectHash={selected.projectHash}
          sessionId={selected.sessionId}
          projectPath={selected.projectPath}
          isNew={selected.isNew}
        />
      ) : (
        <EmptyState onCreateSession={handleCreateFromEmpty} />
      );
    }
    return (
      <CronTaskDetail
        taskId={selectedCronTaskId}
        onTaskDeleted={() => setSelectedCronTaskId(null)}
      />
    );
  };

  return (
    <Layout
      nav={<NavSidebar />}
      sidebar={renderSidebar()}
      main={renderMain()}
    />
  );
}
