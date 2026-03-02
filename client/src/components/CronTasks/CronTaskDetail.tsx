import { useState, useEffect, useCallback, useRef } from 'react';
import { CronTask, CronExecution, SessionSummary } from '../../types';
import {
  fetchCronTasks,
  updateCronTask,
  deleteCronTask,
  runCronTask,
  fetchCronExecutions,
} from '../../api/cron';
import { fetchSessions } from '../../api/sessions';
import CronTaskForm from './CronTaskForm';
import { describeCron } from './CronExpressionBuilder';
import { useUIStore } from '../../stores/useUIStore';
import { StatusBadge } from '../StatusDot';
import Collapsible from '../Collapsible';

interface Props {
  taskId: string | null;
  onTaskDeleted: () => void;
}

export default function CronTaskDetail({ taskId, onTaskDeleted }: Props) {
  const [task, setTask] = useState<CronTask | null>(null);
  const [executions, setExecutions] = useState<CronExecution[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [running, setRunning] = useState(false);
  const fastPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const editingCronTaskId = useUIStore(s => s.editingCronTaskId);
  const setEditingCronTaskId = useUIStore(s => s.setEditingCronTaskId);
  const selectSession = useUIStore(s => s.selectSession);
  const setView = useUIStore(s => s.setView);

  const editing = editingCronTaskId === taskId && taskId !== null;
  const setEditing = (val: boolean) => setEditingCronTaskId(val ? taskId : null);

  const loadTask = useCallback(async () => {
    if (!taskId) {
      setTask(null);
      setExecutions([]);
      return;
    }
    try {
      const tasks = await fetchCronTasks();
      const found = tasks.find(t => t.id === taskId);
      setTask(found ?? null);
      const execs = await fetchCronExecutions(taskId);
      setExecutions(execs);
      // Load sessions for jump-to-session feature
      const groups = await fetchSessions(undefined, true);
      setSessions(groups.flatMap(g => g.sessions));
    } catch (err) {
      console.error('Failed to load task detail:', err);
    }
  }, [taskId]);

  // When new executions appear while running, stop fast poll
  const prevExecCountRef = useRef(executions.length);
  useEffect(() => {
    if (running && executions.length > prevExecCountRef.current) {
      // New execution appeared — stop fast poll after a short delay to let it settle
      if (fastPollRef.current) { clearInterval(fastPollRef.current); fastPollRef.current = null; }
      setRunning(false);
    }
    prevExecCountRef.current = executions.length;
  }, [executions.length, running]);

  useEffect(() => {
    loadTask();
    const interval = setInterval(loadTask, 5000);
    return () => {
      clearInterval(interval);
      if (fastPollRef.current) clearInterval(fastPollRef.current);
    };
  }, [loadTask]);

  if (!taskId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-4">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto text-gray-600">
              <rect x="3" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="16" width="7" height="5" rx="1" />
              <path d="M10 5.5h2a2 2 0 0 1 2 2v7a2 2 0 0 0 2 2h-2" />
              <polyline points="14 14.5 16 16.5 14 18.5" />
            </svg>
          </div>
          <p className="text-lg">Select a workflow to view</p>
          <p className="text-sm mt-1">Or create a new one from the left panel</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return <div className="p-6 text-gray-500">Loading...</div>;
  }

  const handleToggle = async () => {
    try {
      const updated = await updateCronTask(task.id, { enabled: !task.enabled });
      setTask(updated);
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete task "${task.name}"?`)) return;
    try {
      await deleteCronTask(task.id);
      onTaskDeleted();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleRun = async () => {
    setRunning(true);
    try {
      await runCronTask(task.id);
      // Poll every 2s for up to 30s until new execution appears, then revert to normal 5s
      const prevCount = executions.length;
      let elapsed = 0;
      if (fastPollRef.current) clearInterval(fastPollRef.current);
      fastPollRef.current = setInterval(async () => {
        elapsed += 2000;
        await loadTask();
        // Stop fast polling once new execution appears or after 30s
        if (elapsed >= 30000) {
          if (fastPollRef.current) { clearInterval(fastPollRef.current); fastPollRef.current = null; }
          setRunning(false);
        }
      }, 2000);
      // Also do an immediate reload
      await loadTask();
    } catch (err) {
      console.error('Failed to run task:', err);
      setRunning(false);
    }
  };

  const handleUpdate = async (data: {
    name: string;
    cronExpression: string;
    prompt: string;
    projectPath?: string;
    enabled: boolean;
  }) => {
    try {
      const updated = await updateCronTask(task.id, data);
      setTask(updated);
      setEditing(false);
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  if (editing) {
    return (
      <div className="px-4 py-3 overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-200 mb-3">Edit Task</h2>
        <CronTaskForm
          initial={task}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-200">{task.name}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggle}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                task.enabled
                  ? 'bg-green-900/50 text-green-400 hover:bg-green-900/70'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {task.enabled ? 'Enabled' : 'Disabled'}
            </button>
            <button
              onClick={handleRun}
              disabled={running}
              className="text-xs px-3 py-1.5 bg-claude text-white rounded-lg hover:bg-claude-hover transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {running ? (
                <>
                  <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Starting...
                </>
              ) : 'Run Now'}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="text-xs px-3 py-1.5 bg-red-900/50 text-red-400 rounded-lg hover:bg-red-900/70 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">Schedule:</span>{' '}
            <span className="text-gray-300">{describeCron(task.cronExpression)}</span>
            <span className="text-gray-600 font-mono text-xs ml-2">{task.cronExpression}</span>
          </div>
          {task.projectPath && (
            <div>
              <span className="text-gray-500">Project:</span>{' '}
              <span className="text-gray-300">{task.projectPath}</span>
            </div>
          )}
          <div>
            <span className="text-gray-500">Last run:</span>{' '}
            <span className="text-gray-300">
              {task.lastRun ? new Date(task.lastRun).toLocaleString() : 'Never'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Created:</span>{' '}
            <span className="text-gray-300">
              {new Date(task.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="mt-2">
          <span className="text-gray-500 text-sm">Prompt:</span>
          <pre className="mt-1 text-sm text-gray-300 bg-gray-800 rounded-lg p-2 whitespace-pre-wrap max-h-32 overflow-y-auto">
            {task.prompt}
          </pre>
        </div>
      </div>

      {/* Execution History */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <Collapsible title="Execution History" count={executions.length} defaultOpen storageKey="claudit:cronExecHistory">
          {executions.length === 0 ? (
            <div className="text-gray-600 text-sm">No executions yet.</div>
          ) : (
            <div className="space-y-2">
              {executions.map(exec => (
                <ExecutionCard key={exec.id} execution={exec} sessions={sessions} onJumpToSession={(s) => {
                  selectSession(s.projectHash, s.sessionId, s.projectPath);
                  setView('sessions');
                }} />
              ))}
            </div>
          )}
        </Collapsible>
      </div>
    </div>
  );
}

function ExecutionCard({ execution, sessions, onJumpToSession }: {
  execution: CronExecution;
  sessions: SessionSummary[];
  onJumpToSession: (session: SessionSummary) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const duration = execution.finishedAt
    ? Math.round(
        (new Date(execution.finishedAt).getTime() - new Date(execution.startedAt).getTime()) / 1000
      )
    : null;

  const linkedSession = execution.sessionId
    ? sessions.find(s => s.sessionId === execution.sessionId)
    : undefined;

  return (
    <div className="border border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <StatusBadge status={execution.status} />
          <span className="text-xs text-gray-400">
            {new Date(execution.startedAt).toLocaleString()}
          </span>
          {duration !== null && (
            <span className="text-xs text-gray-600">{duration}s</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {linkedSession && (
            <span
              onClick={(e) => { e.stopPropagation(); onJumpToSession(linkedSession); }}
              className="text-xs px-2 py-0.5 bg-gray-700 text-claude rounded hover:bg-gray-600 transition-colors cursor-pointer flex items-center gap-1"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Session
            </span>
          )}
          <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-2 border-t border-gray-800">
          {execution.output && (
            <div className="mt-2">
              <div className="text-xs text-gray-500 mb-1">Output:</div>
              <pre className="text-xs text-gray-300 bg-gray-900 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                {execution.output}
              </pre>
            </div>
          )}
          {execution.error && (
            <div className="mt-2">
              <div className="text-xs text-red-400 mb-1">Error:</div>
              <pre className="text-xs text-red-300 bg-red-900/20 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                {execution.error}
              </pre>
            </div>
          )}
          {!execution.output && !execution.error && (
            <div className="mt-2 text-xs text-gray-600">
              {execution.status === 'running' ? 'Task is still running...' : 'No output.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
