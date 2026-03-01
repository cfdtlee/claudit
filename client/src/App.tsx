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
    connectEventStream();
    return () => disconnectEventStream();
  }, [connectEventStream, disconnectEventStream]);

  const handleCreateFromEmpty = useCallback(async (projectPath: string, initialPrompt?: string, worktree?: { branchName: string }): Promise<boolean> => {
    try {
      const result = await createSession(projectPath, { initialPrompt, worktree });
      if (result) {
        selectSession(result.projectHash, result.sessionId, result.projectPath, true);
        return true;
      }
      return false;
    } catch {
      return false;
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
