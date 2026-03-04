import { useState, useEffect, useCallback } from 'react';
import { Task, TaskStatus, TaskSession, Agent, Project, SessionSummary } from '../../types';
import { fetchTask, updateTask, deleteTask, updateTaskStatus, fetchTaskSessions } from '../../api/tasks';
import { fetchAgents } from '../../api/agents';
import { fetchProjects } from '../../api/projects';
import { fetchSessions, createSession } from '../../api/sessions';
import { useUIStore } from '../../stores/useUIStore';
import { cn } from '../../lib/utils';
import {
  CheckCircle2, Edit3, Trash2, Play, Pause, RotateCcw, XCircle,
  ExternalLink, Bell, Loader2, GitBranch, FileCode, Zap, Tag,
  AlertTriangle, Clock, CircleCheck,
} from 'lucide-react';
import TaskForm from './TaskForm';
import TaskEmptyState from './TaskEmptyState';
import ClaudeItModal from './ClaudeItModal';
import { StatusBadge, StatusType } from '../StatusDot';
import Collapsible from '../Collapsible';

const PRIORITY_LABELS: Record<number, { text: string; className: string }> = {
  1: { text: 'Low', className: 'bg-secondary text-muted-foreground' },
  2: { text: 'Medium', className: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
  3: { text: 'High', className: 'bg-red-500/10 text-red-400 border border-red-500/20' },
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  waiting: 'Waiting for Input',
  draft: 'Draft',
  paused: 'Paused',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-secondary text-secondary-foreground',
  running: 'bg-blue-500/15 text-blue-400',
  waiting: 'bg-red-500/15 text-red-400',
  draft: 'bg-purple-500/15 text-purple-400',
  paused: 'bg-amber-500/15 text-amber-400',
  done: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
  cancelled: 'bg-secondary text-muted-foreground',
};

const TRANSITIONS: Record<TaskStatus, { label: string; status: TaskStatus; icon: React.ElementType; variant: string }[]> = {
  pending: [
    { label: 'Start', status: 'running', icon: Play, variant: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' },
    { label: 'Cancel', status: 'cancelled', icon: XCircle, variant: 'bg-secondary text-muted-foreground hover:bg-secondary/80' },
  ],
  running: [
    { label: 'Pause', status: 'paused', icon: Pause, variant: 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' },
    { label: 'Complete', status: 'done', icon: CircleCheck, variant: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' },
    { label: 'Fail', status: 'failed', icon: AlertTriangle, variant: 'bg-red-500/10 text-red-400 hover:bg-red-500/20' },
  ],
  waiting: [
    { label: 'Resume', status: 'running', icon: Play, variant: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' },
    { label: 'Cancel', status: 'cancelled', icon: XCircle, variant: 'bg-secondary text-muted-foreground hover:bg-secondary/80' },
  ],
  draft: [
    { label: 'Approve', status: 'pending', icon: CircleCheck, variant: 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' },
    { label: 'Cancel', status: 'cancelled', icon: XCircle, variant: 'bg-secondary text-muted-foreground hover:bg-secondary/80' },
  ],
  paused: [
    { label: 'Resume', status: 'running', icon: Play, variant: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' },
    { label: 'Cancel', status: 'cancelled', icon: XCircle, variant: 'bg-secondary text-muted-foreground hover:bg-secondary/80' },
  ],
  done: [
    { label: 'Reopen', status: 'pending', icon: RotateCcw, variant: 'bg-secondary text-muted-foreground hover:bg-secondary/80' },
  ],
  failed: [
    { label: 'Retry', status: 'pending', icon: RotateCcw, variant: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' },
    { label: 'Cancel', status: 'cancelled', icon: XCircle, variant: 'bg-secondary text-muted-foreground hover:bg-secondary/80' },
  ],
  cancelled: [
    { label: 'Reopen', status: 'pending', icon: RotateCcw, variant: 'bg-secondary text-muted-foreground hover:bg-secondary/80' },
  ],
};

interface Props {
  taskId: string | null;
  onTaskDeleted: () => void;
  onTaskCreated: (id: string) => void;
}

export default function TaskDetail({ taskId, onTaskDeleted, onTaskCreated }: Props) {
  const [task, setTask] = useState<(Task & { subtasks?: Task[] }) | null>(null);
  const [taskSessions, setTaskSessions] = useState<TaskSession[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [showClaudeItModal, setShowClaudeItModal] = useState(false);
  const [claudeItLoading, setClaudeItLoading] = useState(false);

  const selectSession = useUIStore(s => s.selectSession);
  const setView = useUIStore(s => s.setView);
  const setPendingTaskPrompt = useUIStore(s => s.setPendingTaskPrompt);
  const editingTaskId = useUIStore(s => s.editingTaskId);
  const setEditingTaskId = useUIStore(s => s.setEditingTaskId);

  const editing = editingTaskId === taskId && taskId !== null;
  const setEditing = (val: boolean) => setEditingTaskId(val ? taskId : null);

  const loadTask = useCallback(async () => {
    if (!taskId) {
      setTask(null);
      setTaskSessions([]);
      return;
    }
    try {
      const [taskData, sessionsData, agentsData, projectsData] = await Promise.all([
        fetchTask(taskId),
        fetchTaskSessions(taskId),
        fetchAgents(),
        fetchProjects(),
      ]);
      setTask(taskData);
      setTaskSessions(sessionsData);
      setAgents(agentsData);
      setProjects(projectsData);
    } catch (err) {
      console.error('Failed to load task:', err);
    }
  }, [taskId]);

  const loadSessions = useCallback(async () => {
    try {
      const groups = await fetchSessions(undefined, true);
      setSessions(groups.flatMap(g => g.sessions));
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, []);

  useEffect(() => {
    if (editingTaskId && editingTaskId !== taskId) {
      setEditingTaskId(null);
    }
  }, [taskId]);

  useEffect(() => {
    loadTask();
    loadSessions();
  }, [loadTask, loadSessions]);

  if (!taskId) {
    return <TaskEmptyState onTaskCreated={onTaskCreated} />;
  }

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
      </div>
    );
  }

  const agentMap = new Map(agents.map(a => [a.id, a]));
  const projectMap = new Map(projects.map(p => [p.id, p]));
  const assignedAgent = task.assignee ? agentMap.get(task.assignee) : undefined;
  const assignedProject = task.projectId ? projectMap.get(task.projectId) : undefined;
  const transitions = TRANSITIONS[task.status] ?? [];
  const isDone = task.status === 'done';
  const priority = PRIORITY_LABELS[task.priority ?? 2] ?? PRIORITY_LABELS[2];

  const handleToggle = async () => {
    try {
      const updated = await updateTask(task.id, {
        status: isDone ? 'pending' : 'done',
        completedAt: isDone ? undefined : new Date().toISOString(),
      });
      setTask(prev => prev ? { ...prev, ...updated } : null);
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    try {
      const updated = await updateTaskStatus(task.id, newStatus);
      setTask(prev => prev ? { ...prev, ...updated } : null);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleUpdate = async (data: Partial<Task>) => {
    try {
      const updated = await updateTask(task.id, data);
      setTask(prev => prev ? { ...prev, ...updated } : null);
      setEditing(false);
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    try {
      await deleteTask(task.id);
      onTaskDeleted();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleClaudeIt = async (projectPath: string, worktree?: { branchName: string }, model?: string, permissionMode?: string) => {
    setShowClaudeItModal(false);
    setClaudeItLoading(true);
    try {
      const result = await createSession(projectPath, {
        worktree,
        displayName: task.title,
        model,
        permissionMode,
      });

      const prompt = [
        'I have a task to complete:',
        '',
        `Title: ${task.title}`,
        `Priority: ${priority.text}`,
        task.description ? `Description: ${task.description}` : '',
        task.prompt ? `Instructions: ${task.prompt}` : '',
        '',
        'Please help me complete this task. Start by understanding what needs to be done, then propose an approach and implement it step by step.',
      ].filter(line => line !== '').join('\n');

      const updated = await updateTask(task.id, {
        sessionId: result.sessionId,
        sessionLabel: `Claudit: ${task.title}`,
      });
      setTask(prev => prev ? { ...prev, ...updated } : null);
      setPendingTaskPrompt({ sessionId: result.sessionId, prompt });
      selectSession(result.projectHash, result.sessionId, result.projectPath);
      setView('sessions');
    } catch (err: any) {
      console.error('Failed to create Claudit session:', err);
      alert(`Failed to create session: ${err.message}`);
    } finally {
      setClaudeItLoading(false);
    }
  };

  if (editing) {
    return (
      <div className="px-6 py-4 overflow-y-auto">
        <h2 className="text-lg font-semibold text-foreground mb-4">Edit Task</h2>
        <TaskForm
          initial={task}
          sessions={sessions}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Waiting alert */}
      {task.status === 'waiting' && (
        <div className="mx-4 mt-3 bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 animate-slide-in">
          <Bell className="w-5 h-5 text-red-400 animate-pulse-soft" />
          <div>
            <div className="text-sm font-medium text-red-300">Waiting for human input</div>
            <div className="text-xs text-red-400/60 mt-0.5">This task's agent needs your response to continue.</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggle}
              className={cn(
                'w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center transition-all',
                isDone
                  ? 'bg-primary text-primary-foreground'
                  : 'border-2 border-muted-foreground/30 hover:border-primary/60'
              )}
            >
              {isDone && <CheckCircle2 className="w-4 h-4" />}
            </button>
            <h2 className={cn(
              'text-lg font-semibold',
              isDone ? 'text-muted-foreground line-through' : 'text-foreground'
            )}>
              {task.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {!task.sessionId && !isDone && task.status !== 'cancelled' && (
              <button
                onClick={() => setShowClaudeItModal(true)}
                disabled={claudeItLoading}
                className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-1.5 font-medium shadow-sm shadow-primary/20"
              >
                {claudeItLoading ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Creating...</>
                ) : (
                  <><Play className="w-3 h-3" /> Claudit</>
                )}
              </button>
            )}
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

        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className={cn('px-2.5 py-0.5 rounded-md text-xs font-medium', STATUS_COLORS[task.status])}>
            {STATUS_LABELS[task.status]}
          </span>
          <span className={cn('text-xs px-2 py-0.5 rounded-md', priority.className)}>
            {priority.text}
          </span>
          {task.taskType && (
            <span className="px-2 py-0.5 rounded-md text-xs bg-secondary text-secondary-foreground">{task.taskType}</span>
          )}
          {task.tags?.map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded-md text-xs bg-secondary/50 text-muted-foreground flex items-center gap-1">
              <Tag className="w-2.5 h-2.5" /> {tag}
            </span>
          ))}
          <div className="ml-auto flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span className="text-xs">{new Date(task.createdAt).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Status transitions */}
      {transitions.length > 0 && (
        <div className="flex gap-2 px-6 py-3 border-b border-border/50">
          {transitions.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.status}
                onClick={() => handleStatusChange(t.status)}
                className={cn('px-3 py-1.5 text-xs rounded-lg transition-all font-medium flex items-center gap-1.5', t.variant)}
              >
                <Icon className="w-3 h-3" /> {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {task.description && (
          <Collapsible title="Description" defaultOpen storageKey={`claudit:task:${task.id}:desc`}>
            <p className="text-sm text-secondary-foreground whitespace-pre-wrap bg-background/60 rounded-lg p-3 border border-border/50">
              {task.description}
            </p>
          </Collapsible>
        )}

        {task.prompt && (
          <Collapsible title="Prompt" defaultOpen storageKey={`claudit:task:${task.id}:prompt`}>
            <p className="text-sm text-secondary-foreground whitespace-pre-wrap bg-background/60 rounded-lg p-4 border border-border/50 font-mono">{task.prompt}</p>
          </Collapsible>
        )}

        {task.errorMessage && (
          <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-4">
            <h3 className="text-sm font-medium text-destructive mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Error
            </h3>
            <p className="text-sm text-red-300">{task.errorMessage}</p>
          </div>
        )}

        {task.sessionId && (() => {
          const linkedSession = sessions.find(s => s.sessionId === task.sessionId);
          return (
            <Collapsible title="Linked Session" defaultOpen storageKey={`claudit:task:${task.id}:session`}>
              <div className="text-sm bg-background/60 rounded-lg p-3 space-y-2 border border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('text-secondary-foreground', linkedSession && 'cursor-pointer hover:text-primary transition-colors')}
                      onClick={() => {
                        if (linkedSession) {
                          selectSession(linkedSession.projectHash, linkedSession.sessionId, linkedSession.projectPath);
                          setView('sessions');
                        }
                      }}
                    >
                      {task.sessionLabel || task.sessionId}
                    </span>
                    <code className="text-muted-foreground/50 text-xs font-mono">{task.sessionId.slice(0, 8)}</code>
                  </div>
                  {linkedSession && (
                    <button
                      onClick={() => {
                        selectSession(linkedSession.projectHash, linkedSession.sessionId, linkedSession.projectPath);
                        setView('sessions');
                      }}
                      className="text-xs px-2.5 py-1 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors flex items-center gap-1 font-medium"
                    >
                      <ExternalLink className="w-3 h-3" /> Jump to Session
                    </button>
                  )}
                </div>
                {linkedSession && (
                  <div className="flex items-center gap-2">
                    <StatusBadge status={linkedSession.status as StatusType} />
                    {linkedSession.lastMessage && (
                      <span className="text-xs text-muted-foreground truncate ml-2">
                        {linkedSession.lastMessage.slice(0, 80)}{linkedSession.lastMessage.length > 80 ? '...' : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Collapsible>
          );
        })()}

        {(assignedAgent || assignedProject || task.branch || task.prUrl || task.tokenUsage != null) && (
          <div className="grid grid-cols-2 gap-4">
            {assignedAgent && (
              <div className="bg-background/50 rounded-lg p-3 border border-border/50">
                <h3 className="text-xs text-muted-foreground mb-1 font-medium">Assignee</h3>
                <p className="text-sm text-foreground">{assignedAgent.name}</p>
              </div>
            )}
            {assignedProject && (
              <div className="bg-background/50 rounded-lg p-3 border border-border/50">
                <h3 className="text-xs text-muted-foreground mb-1 font-medium">Project</h3>
                <p className="text-sm text-foreground">{assignedProject.name}</p>
              </div>
            )}
            {task.branch && (
              <div className="bg-background/50 rounded-lg p-3 border border-border/50">
                <h3 className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1"><GitBranch className="w-3 h-3" /> Branch</h3>
                <p className="text-sm text-foreground font-mono">{task.branch}</p>
              </div>
            )}
            {task.prUrl && (
              <div className="bg-background/50 rounded-lg p-3 border border-border/50">
                <h3 className="text-xs text-muted-foreground mb-1 font-medium">PR</h3>
                <a href={task.prUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">{task.prUrl}</a>
              </div>
            )}
            {task.tokenUsage != null && (
              <div className="bg-background/50 rounded-lg p-3 border border-border/50">
                <h3 className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1"><Zap className="w-3 h-3" /> Token Usage</h3>
                <p className="text-sm text-foreground">{task.tokenUsage.toLocaleString()}</p>
              </div>
            )}
          </div>
        )}

        {task.resultSummary && (
          <Collapsible title="Result Summary" storageKey={`claudit:task:${task.id}:result`}>
            <p className="text-sm text-secondary-foreground whitespace-pre-wrap bg-background/60 rounded-lg p-4 border border-border/50">{task.resultSummary}</p>
          </Collapsible>
        )}

        {task.acceptanceCriteria && (
          <Collapsible title="Acceptance Criteria" storageKey={`claudit:task:${task.id}:criteria`}>
            <p className="text-sm text-secondary-foreground whitespace-pre-wrap">{task.acceptanceCriteria}</p>
          </Collapsible>
        )}

        {task.subtasks && task.subtasks.length > 0 && (
          <Collapsible title={`Subtasks (${task.subtasks.length})`} defaultOpen storageKey={`claudit:task:${task.id}:subs`}>
            <div className="space-y-1.5">
              {task.subtasks.map(sub => (
                <div key={sub.id} className="flex items-center gap-2 px-3 py-2 bg-background/50 rounded-lg border border-border/50">
                  <span className={cn('text-xs px-2 py-0.5 rounded-md font-medium', STATUS_COLORS[sub.status])}>
                    {STATUS_LABELS[sub.status]}
                  </span>
                  <span className="text-sm text-foreground">{sub.title}</span>
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {taskSessions.some(s => s.checkpoints && s.checkpoints.length > 0) && (
          <Collapsible title="Checkpoints" storageKey={`claudit:task:${task.id}:checkpoints`}>
            <div className="space-y-1.5">
              {taskSessions.flatMap(s => (s.checkpoints ?? []).map((cp, i) => (
                <div key={`${s.id}-cp-${i}`} className="flex items-start gap-3 px-3 py-2 bg-background/50 rounded-lg border border-border/50">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-foreground">{cp.step}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{new Date(cp.timestamp).toLocaleString()}</div>
                    {cp.output && (
                      <pre className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap font-mono bg-background/50 rounded p-2">{cp.output}</pre>
                    )}
                  </div>
                </div>
              )))}
            </div>
          </Collapsible>
        )}

        {taskSessions.length > 0 && (
          <Collapsible title={`Session History (${taskSessions.length})`} storageKey={`claudit:task:${task.id}:hist`}>
            <div className="space-y-1.5">
              {taskSessions.map(s => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-background/60 rounded-lg text-sm border border-border/50">
                  <div className="flex items-center gap-2">
                    <code className="text-foreground font-mono text-xs">{s.sessionId.slice(0, 8)}</code>
                    {s.agentId && agentMap.get(s.agentId) && (
                      <span className="text-muted-foreground">{agentMap.get(s.agentId)!.name}</span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {new Date(s.startedAt).toLocaleString()}
                    {s.tokenUsage != null && ` \u00B7 ${s.tokenUsage.toLocaleString()} tokens`}
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {task.filesChanged && task.filesChanged.length > 0 && (
          <Collapsible title={`Files Changed (${task.filesChanged.length})`} storageKey={`claudit:task:${task.id}:files`}>
            <div className="bg-background/60 rounded-lg p-3 border border-border/50">
              {task.filesChanged.map((f, i) => (
                <div key={i} className="text-sm text-foreground font-mono py-0.5 flex items-center gap-1.5">
                  <FileCode className="w-3 h-3 text-muted-foreground" /> {f}
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {!task.description && !task.prompt && !task.sessionId && !task.errorMessage && !task.resultSummary && (
          <div className="text-muted-foreground text-sm py-4 text-center">No additional details.</div>
        )}
      </div>

      {showClaudeItModal && (
        <ClaudeItModal
          onSelect={handleClaudeIt}
          onClose={() => setShowClaudeItModal(false)}
        />
      )}
    </div>
  );
}
