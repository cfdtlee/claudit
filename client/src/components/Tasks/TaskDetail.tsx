import { useState, useEffect, useCallback } from 'react';
import { Task, TaskStatus, TaskSession, Agent, Project, SessionSummary } from '../../types';
import { fetchTask, updateTask, deleteTask, updateTaskStatus, fetchTaskSessions } from '../../api/tasks';
import { fetchAgents } from '../../api/agents';
import { fetchProjects } from '../../api/projects';
import { fetchSessions, createSession } from '../../api/sessions';
import { useUIStore } from '../../stores/useUIStore';
import TaskForm from './TaskForm';
import TaskEmptyState from './TaskEmptyState';
import ClaudeItModal from './ClaudeItModal';
import { StatusBadge, StatusType } from '../StatusDot';
import Collapsible from '../Collapsible';

const PRIORITY_LABELS: Record<number, { text: string; className: string }> = {
  1: { text: 'Low', className: 'bg-gray-700 text-gray-300' },
  2: { text: 'Medium', className: 'bg-yellow-900/50 text-yellow-400' },
  3: { text: 'High', className: 'bg-red-900/50 text-red-400' },
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
  pending: 'bg-gray-600',
  running: 'bg-blue-600',
  waiting: 'bg-red-600',
  draft: 'bg-purple-600',
  paused: 'bg-yellow-600',
  done: 'bg-green-600',
  failed: 'bg-red-600',
  cancelled: 'bg-gray-700',
};

const TRANSITIONS: Record<TaskStatus, { label: string; status: TaskStatus; color: string }[]> = {
  pending: [
    { label: 'Start', status: 'running', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Cancel', status: 'cancelled', color: 'bg-gray-600 hover:bg-gray-700' },
  ],
  running: [
    { label: 'Pause', status: 'paused', color: 'bg-yellow-600 hover:bg-yellow-700' },
    { label: 'Complete', status: 'done', color: 'bg-green-600 hover:bg-green-700' },
    { label: 'Fail', status: 'failed', color: 'bg-red-600 hover:bg-red-700' },
  ],
  waiting: [
    { label: 'Resume', status: 'running', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Cancel', status: 'cancelled', color: 'bg-gray-600 hover:bg-gray-700' },
  ],
  draft: [
    { label: 'Approve', status: 'pending', color: 'bg-green-600 hover:bg-green-700' },
    { label: 'Cancel', status: 'cancelled', color: 'bg-gray-600 hover:bg-gray-700' },
  ],
  paused: [
    { label: 'Resume', status: 'running', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Cancel', status: 'cancelled', color: 'bg-gray-600 hover:bg-gray-700' },
  ],
  done: [
    { label: 'Reopen', status: 'pending', color: 'bg-gray-600 hover:bg-gray-700' },
  ],
  failed: [
    { label: 'Retry', status: 'pending', color: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Cancel', status: 'cancelled', color: 'bg-gray-600 hover:bg-gray-700' },
  ],
  cancelled: [
    { label: 'Reopen', status: 'pending', color: 'bg-gray-600 hover:bg-gray-700' },
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

  // Clear edit mode when switching tasks
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
    return <div className="flex-1 flex items-center justify-center text-gray-500">Loading...</div>;
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
      <div className="px-4 py-3 overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-200 mb-3">Edit Task</h2>
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
        <div className="mx-4 mt-3 bg-red-900/30 border border-red-600/50 rounded-lg p-4 flex items-center gap-3">
          <span className="text-2xl">&#128276;</span>
          <div>
            <div className="text-sm font-medium text-red-300">Waiting for human input</div>
            <div className="text-xs text-red-400/70 mt-0.5">This task's agent needs your response to continue.</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggle}
              className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                isDone
                  ? 'bg-claude border-claude'
                  : 'border-gray-500 hover:border-gray-300'
              }`}
            >
              {isDone && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <h2 className={`text-lg font-semibold ${
              isDone ? 'text-gray-500 line-through' : 'text-gray-200'
            }`}>
              {task.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {!task.sessionId && !isDone && task.status !== 'cancelled' && (
              <button
                onClick={() => setShowClaudeItModal(true)}
                disabled={claudeItLoading}
                className="text-xs px-3 py-1.5 bg-claude text-white rounded-lg hover:bg-claude-hover transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {claudeItLoading ? (
                  <>
                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creating...
                  </>
                ) : (
                  <>
                    <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor">
                      <polygon points="0,0 10,6 0,12" />
                    </svg>
                    Claudit
                  </>
                )}
              </button>
            )}
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

        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className={`px-2 py-0.5 rounded text-xs text-white ${STATUS_COLORS[task.status]}`}>
            {STATUS_LABELS[task.status]}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded ${priority.className}`}>
            {priority.text}
          </span>
          {task.taskType && (
            <span className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300">{task.taskType}</span>
          )}
          {task.tags?.map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400">
              {tag}
            </span>
          ))}
          <div className="ml-auto">
            <span className="text-gray-500">Created:</span>{' '}
            <span className="text-gray-300">{new Date(task.createdAt).toLocaleString()}</span>
          </div>
          {task.completedAt && (
            <div>
              <span className="text-gray-500">Completed:</span>{' '}
              <span className="text-gray-300">{new Date(task.completedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Status transitions */}
      {transitions.length > 0 && (
        <div className="flex gap-2 px-4 py-2 border-b border-gray-800">
          {transitions.map(t => (
            <button
              key={t.status}
              onClick={() => handleStatusChange(t.status)}
              className={`px-3 py-1.5 text-xs text-white rounded-lg transition-colors ${t.color}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {/* Description */}
        {task.description && (
          <Collapsible title="Description" defaultOpen storageKey={`claudit:task:${task.id}:desc`}>
            <p className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-800 rounded-lg p-2">
              {task.description}
            </p>
          </Collapsible>
        )}

        {/* Prompt */}
        {task.prompt && (
          <Collapsible title="Prompt" defaultOpen storageKey={`claudit:task:${task.id}:prompt`}>
            <p className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-800/50 rounded-lg p-4">{task.prompt}</p>
          </Collapsible>
        )}

        {/* Error message */}
        {task.errorMessage && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-red-400 mb-1">Error</h3>
            <p className="text-sm text-red-300">{task.errorMessage}</p>
          </div>
        )}

        {/* Linked Session */}
        {task.sessionId && (() => {
          const linkedSession = sessions.find(s => s.sessionId === task.sessionId);
          return (
            <Collapsible title="Linked Session" defaultOpen storageKey={`claudit:task:${task.id}:session`}>
              <div className="text-sm bg-gray-800 rounded-lg p-2 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-gray-300 ${linkedSession ? 'cursor-pointer hover:text-claude transition-colors' : ''}`}
                      onClick={() => {
                        if (linkedSession) {
                          selectSession(linkedSession.projectHash, linkedSession.sessionId, linkedSession.projectPath);
                          setView('sessions');
                        }
                      }}
                    >
                      {task.sessionLabel || task.sessionId}
                    </span>
                    <span className="text-gray-600 text-xs font-mono">{task.sessionId}</span>
                  </div>
                  {linkedSession && (
                    <button
                      onClick={() => {
                        selectSession(linkedSession.projectHash, linkedSession.sessionId, linkedSession.projectPath);
                        setView('sessions');
                      }}
                      className="text-xs px-2 py-1 bg-gray-700 text-claude rounded hover:bg-gray-600 transition-colors flex items-center gap-1"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                      Jump to Session
                    </button>
                  )}
                </div>
                {linkedSession && (
                  <div className="flex items-center gap-2">
                    <StatusBadge status={linkedSession.status as StatusType} />
                    {linkedSession.lastMessage && (
                      <span className="text-xs text-gray-500 truncate ml-2">
                        {linkedSession.lastMessage.slice(0, 80)}{linkedSession.lastMessage.length > 80 ? '...' : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Collapsible>
          );
        })()}

        {/* Meta info */}
        {(assignedAgent || assignedProject || task.branch || task.prUrl || task.tokenUsage != null) && (
          <div className="grid grid-cols-2 gap-4">
            {assignedAgent && (
              <div>
                <h3 className="text-xs text-gray-500 mb-1">Assignee</h3>
                <p className="text-sm text-gray-300">{assignedAgent.name}</p>
              </div>
            )}
            {assignedProject && (
              <div>
                <h3 className="text-xs text-gray-500 mb-1">Project</h3>
                <p className="text-sm text-gray-300">{assignedProject.name}</p>
              </div>
            )}
            {task.branch && (
              <div>
                <h3 className="text-xs text-gray-500 mb-1">Branch</h3>
                <p className="text-sm text-gray-300 font-mono">{task.branch}</p>
              </div>
            )}
            {task.prUrl && (
              <div>
                <h3 className="text-xs text-gray-500 mb-1">PR</h3>
                <a href={task.prUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline">{task.prUrl}</a>
              </div>
            )}
            {task.tokenUsage != null && (
              <div>
                <h3 className="text-xs text-gray-500 mb-1">Token Usage</h3>
                <p className="text-sm text-gray-300">{task.tokenUsage.toLocaleString()}</p>
              </div>
            )}
          </div>
        )}

        {/* Result summary */}
        {task.resultSummary && (
          <Collapsible title="Result Summary" storageKey={`claudit:task:${task.id}:result`}>
            <p className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-800/50 rounded-lg p-4">{task.resultSummary}</p>
          </Collapsible>
        )}

        {/* Acceptance criteria */}
        {task.acceptanceCriteria && (
          <Collapsible title="Acceptance Criteria" storageKey={`claudit:task:${task.id}:criteria`}>
            <p className="text-sm text-gray-300 whitespace-pre-wrap">{task.acceptanceCriteria}</p>
          </Collapsible>
        )}

        {/* Subtasks */}
        {task.subtasks && task.subtasks.length > 0 && (
          <Collapsible title={`Subtasks (${task.subtasks.length})`} defaultOpen storageKey={`claudit:task:${task.id}:subs`}>
            <div className="space-y-1">
              {task.subtasks.map(sub => (
                <div key={sub.id} className="flex items-center gap-2 px-3 py-2 bg-gray-800/50 rounded-lg">
                  <span className={`text-xs ${STATUS_COLORS[sub.status]} px-1.5 py-0.5 rounded text-white`}>
                    {STATUS_LABELS[sub.status]}
                  </span>
                  <span className="text-sm text-gray-300">{sub.title}</span>
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {/* Checkpoints */}
        {taskSessions.some(s => s.checkpoints && s.checkpoints.length > 0) && (
          <Collapsible title="Checkpoints" storageKey={`claudit:task:${task.id}:checkpoints`}>
            <div className="space-y-1">
              {taskSessions.flatMap(s => (s.checkpoints ?? []).map((cp, i) => (
                <div key={`${s.id}-cp-${i}`} className="flex items-start gap-3 px-3 py-2 bg-gray-800/50 rounded-lg">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-green-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-300">{cp.step}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{new Date(cp.timestamp).toLocaleString()}</div>
                    {cp.output && (
                      <pre className="text-xs text-gray-400 mt-1 whitespace-pre-wrap font-mono">{cp.output}</pre>
                    )}
                  </div>
                </div>
              )))}
            </div>
          </Collapsible>
        )}

        {/* Task Session history */}
        {taskSessions.length > 0 && (
          <Collapsible title={`Session History (${taskSessions.length})`} storageKey={`claudit:task:${task.id}:hist`}>
            <div className="space-y-1">
              {taskSessions.map(s => (
                <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-gray-800/50 rounded-lg text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-300 font-mono text-xs">{s.sessionId.slice(0, 8)}</span>
                    {s.agentId && agentMap.get(s.agentId) && (
                      <span className="text-gray-500">{agentMap.get(s.agentId)!.name}</span>
                    )}
                  </div>
                  <div className="text-gray-500 text-xs">
                    {new Date(s.startedAt).toLocaleString()}
                    {s.tokenUsage != null && ` \u00B7 ${s.tokenUsage.toLocaleString()} tokens`}
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>
        )}

        {/* Files changed */}
        {task.filesChanged && task.filesChanged.length > 0 && (
          <Collapsible title={`Files Changed (${task.filesChanged.length})`} storageKey={`claudit:task:${task.id}:files`}>
            <div className="bg-gray-800/50 rounded-lg p-3">
              {task.filesChanged.map((f, i) => (
                <div key={i} className="text-sm text-gray-300 font-mono py-0.5">{f}</div>
              ))}
            </div>
          </Collapsible>
        )}

        {/* Empty detail */}
        {!task.description && !task.prompt && !task.sessionId && !task.errorMessage && !task.resultSummary && (
          <div className="text-gray-600 text-sm">No additional details.</div>
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
