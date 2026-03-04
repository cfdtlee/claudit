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
import { cn } from '../../lib/utils';
import {
  Play, Edit3, Trash2, Loader2, ExternalLink, ChevronDown, ChevronUp,
  Clock, Workflow, ToggleLeft, ToggleRight,
} from 'lucide-react';
import CronTaskForm from './CronTaskForm';
import CronTaskEmptyState from './CronTaskEmptyState';
import { describeCron } from './CronExpressionBuilder';
import { useUIStore } from '../../stores/useUIStore';
import { StatusBadge } from '../StatusDot';
import Collapsible from '../Collapsible';

interface Props {
  taskId: string | null;
  onTaskDeleted: () => void;
  onTaskCreated?: (id: string) => void;
}

export default function CronTaskDetail({ taskId, onTaskDeleted, onTaskCreated }: Props) {
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
      const groups = await fetchSessions(undefined, true);
      setSessions(groups.flatMap(g => g.sessions));
    } catch (err) {
      console.error('Failed to load task detail:', err);
    }
  }, [taskId]);

  const prevExecCountRef = useRef(executions.length);
  useEffect(() => {
    if (running && executions.length > prevExecCountRef.current) {
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
    return <CronTaskEmptyState onTaskCreated={(id) => onTaskCreated?.(id)} />;
  }

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
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
      if (fastPollRef.current) clearInterval(fastPollRef.current);
      let elapsed = 0;
      fastPollRef.current = setInterval(async () => {
        elapsed += 2000;
        await loadTask();
        if (elapsed >= 30000) {
          if (fastPollRef.current) { clearInterval(fastPollRef.current); fastPollRef.current = null; }
          setRunning(false);
        }
      }, 2000);
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
      <div className="px-6 py-4 overflow-y-auto">
        <h2 className="text-lg font-semibold text-foreground mb-4">Edit Task</h2>
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
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">{task.name}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggle}
              className={cn(
                'text-xs px-3 py-1.5 rounded-lg transition-all font-medium flex items-center gap-1.5',
                task.enabled
                  ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              )}
            >
              {task.enabled ? <><ToggleRight className="w-3.5 h-3.5" /> Enabled</> : <><ToggleLeft className="w-3.5 h-3.5" /> Disabled</>}
            </button>
            <button
              onClick={handleRun}
              disabled={running}
              className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-1.5 font-medium shadow-sm shadow-primary/20"
            >
              {running ? <><Loader2 className="w-3 h-3 animate-spin" /> Starting...</> : <><Play className="w-3 h-3" /> Run Now</>}
            </button>
            <button
              onClick={() => setEditing(true)}
              className="text-xs px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-1"
            >
              <Edit3 className="w-3 h-3" /> Edit
            </button>
            <button
              onClick={handleDelete}
              className="text-xs px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-background/60 rounded-lg p-3 border border-border/50">
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-1"><Clock className="w-3 h-3" /> Schedule</span>
            <div className="text-sm text-foreground mt-1">{describeCron(task.cronExpression)}</div>
            <code className="text-xs text-muted-foreground/60 font-mono">{task.cronExpression}</code>
          </div>
          {task.projectPath && (
            <div className="bg-background/60 rounded-lg p-3 border border-border/50">
              <span className="text-xs text-muted-foreground font-medium">Project</span>
              <div className="text-sm text-foreground mt-1 truncate">{task.projectPath}</div>
            </div>
          )}
          <div className="bg-background/60 rounded-lg p-3 border border-border/50">
            <span className="text-xs text-muted-foreground font-medium">Last run</span>
            <div className="text-sm text-foreground mt-1">{task.lastRun ? new Date(task.lastRun).toLocaleString() : 'Never'}</div>
          </div>
          <div className="bg-background/60 rounded-lg p-3 border border-border/50">
            <span className="text-xs text-muted-foreground font-medium">Created</span>
            <div className="text-sm text-foreground mt-1">{new Date(task.createdAt).toLocaleString()}</div>
          </div>
        </div>

        <div className="mt-3">
          <span className="text-xs text-muted-foreground font-medium">Prompt</span>
          <pre className="mt-1.5 text-sm text-secondary-foreground bg-background/60 rounded-lg p-3 whitespace-pre-wrap max-h-32 overflow-y-auto border border-border/50 font-mono">
            {task.prompt}
          </pre>
        </div>
      </div>

      {/* Execution History */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <Collapsible title="Execution History" count={executions.length} defaultOpen storageKey="claudit:cronExecHistory">
          {executions.length === 0 ? (
            <div className="text-muted-foreground text-sm text-center py-4">No executions yet.</div>
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
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2.5 flex items-center justify-between hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <StatusBadge status={execution.status} />
          <span className="text-xs text-muted-foreground">
            {new Date(execution.startedAt).toLocaleString()}
          </span>
          {duration !== null && (
            <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
              <Clock className="w-2.5 h-2.5" /> {duration}s
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {linkedSession && (
            <span
              onClick={(e) => { e.stopPropagation(); onJumpToSession(linkedSession); }}
              className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors cursor-pointer flex items-center gap-1 font-medium"
            >
              <ExternalLink className="w-3 h-3" /> Session
            </span>
          )}
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/30 animate-fade-in">
          {execution.output && (
            <div className="mt-2">
              <div className="text-xs text-muted-foreground mb-1 font-medium">Output:</div>
              <pre className="text-xs text-secondary-foreground bg-background/60 rounded-lg p-2.5 max-h-40 overflow-auto whitespace-pre-wrap font-mono border border-border/50">
                {execution.output}
              </pre>
            </div>
          )}
          {execution.error && (
            <div className="mt-2">
              <div className="text-xs text-destructive mb-1 font-medium">Error:</div>
              <pre className="text-xs text-red-300 bg-destructive/5 rounded-lg p-2.5 max-h-40 overflow-auto whitespace-pre-wrap font-mono border border-destructive/20">
                {execution.error}
              </pre>
            </div>
          )}
          {!execution.output && !execution.error && (
            <div className="mt-2 text-xs text-muted-foreground">
              {execution.status === 'running' ? 'Task is still running...' : 'No output.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
