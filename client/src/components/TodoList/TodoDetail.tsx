import { useState, useEffect, useCallback } from 'react';
import { TodoItem, SessionSummary } from '../../types';
import { fetchTodos, updateTodo, deleteTodo } from '../../api/todo';
import { fetchSessions, createSession } from '../../api/sessions';
import { useUIStore } from '../../stores/useUIStore';
import TodoForm from './TodoForm';
import TodoEmptyState from './TodoEmptyState';
import ClaudeItModal from './ClaudeItModal';
import NewSessionModal from '../NewSessionModal';
import { StatusBadge, StatusType } from '../StatusDot';
import Collapsible from '../Collapsible';

const priorityLabels = {
  low: { text: 'Low', className: 'bg-gray-700 text-gray-300' },
  medium: { text: 'Medium', className: 'bg-yellow-900/50 text-yellow-400' },
  high: { text: 'High', className: 'bg-red-900/50 text-red-400' },
};

interface Props {
  todoId: string | null;
  onTodoDeleted: () => void;
  onTodoCreated?: (id: string) => void;
}

export default function TodoDetail({ todoId, onTodoDeleted, onTodoCreated }: Props) {
  const [todo, setTodo] = useState<TodoItem | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [showClaudeItModal, setShowClaudeItModal] = useState(false);
  const [showNewSessionModal, setShowNewSessionModal] = useState(false);
  const [claudeItLoading, setClaudeItLoading] = useState(false);

  const selectSession = useUIStore(s => s.selectSession);
  const setView = useUIStore(s => s.setView);
  const setPendingTodoPrompt = useUIStore(s => s.setPendingTodoPrompt);
  const editingTodoId = useUIStore(s => s.editingTodoId);
  const setEditingTodoId = useUIStore(s => s.setEditingTodoId);

  const editing = editingTodoId === todoId && todoId !== null;
  const setEditing = (val: boolean) => setEditingTodoId(val ? todoId : null);

  const loadTodo = useCallback(async () => {
    if (!todoId) {
      setTodo(null);
      return;
    }
    try {
      const todos = await fetchTodos();
      const found = todos.find(t => t.id === todoId);
      setTodo(found ?? null);
    } catch (err) {
      console.error('Failed to load todo:', err);
    }
  }, [todoId]);

  const loadSessions = useCallback(async () => {
    try {
      const groups = await fetchSessions(undefined, true);
      setSessions(groups.flatMap(g => g.sessions));
    } catch (err) {
      console.error('Failed to load sessions:', err);
    }
  }, []);

  useEffect(() => {
    loadTodo();
    loadSessions();
  }, [loadTodo, loadSessions]);

  if (!todoId) {
    return <TodoEmptyState onTodoCreated={onTodoCreated ?? (() => {})} />;
  }

  if (!todo) {
    return <div className="p-6 text-gray-500">Loading...</div>;
  }

  const handleToggle = async () => {
    try {
      const updated = await updateTodo(todo.id, {
        completed: !todo.completed,
        completedAt: !todo.completed ? new Date().toISOString() : undefined,
      });
      setTodo(updated);
    } catch (err) {
      console.error('Failed to toggle todo:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete todo "${todo.title}"?`)) return;
    try {
      await deleteTodo(todo.id);
      onTodoDeleted();
    } catch (err) {
      console.error('Failed to delete todo:', err);
    }
  };

  const handleUpdate = async (data: {
    title: string;
    description?: string;
    priority: 'low' | 'medium' | 'high';
    sessionId?: string;
    sessionLabel?: string;
  }) => {
    try {
      const updated = await updateTodo(todo.id, data);
      setTodo(updated);
      setEditing(false);
    } catch (err) {
      console.error('Failed to update todo:', err);
    }
  };

  const handleClaudeIt = async (projectPath: string, worktree?: { branchName: string }) => {
    setShowClaudeItModal(false);
    setClaudeItLoading(true);
    try {
      const result = await createSession(projectPath, {
        worktree,
        displayName: todo.title,
      });

      // Build prompt to pre-fill in terminal (user reviews and presses Enter to submit)
      const prompt = [
        'I have a task to complete:',
        '',
        `Title: ${todo.title}`,
        `Priority: ${todo.priority}`,
        todo.description ? `Description: ${todo.description}` : '',
        '',
        'Please help me complete this task. Start by understanding what needs to be done, then propose an approach and implement it step by step.',
      ].filter(line => line !== '').join('\n');

      // Update the todo with the new session
      const updated = await updateTodo(todo.id, {
        sessionId: result.sessionId,
        sessionLabel: `Claude It: ${todo.title}`,
      });
      setTodo(updated);

      // Set prompt to pre-fill in terminal (without auto-submit)
      setPendingTodoPrompt({ sessionId: result.sessionId, prompt });

      // Switch to sessions view and resume the session
      selectSession(result.projectHash, result.sessionId, result.projectPath);
      setView('sessions');
    } catch (err: any) {
      console.error('Failed to create Claude It session:', err);
      alert(`Failed to create session: ${err.message}`);
    } finally {
      setClaudeItLoading(false);
    }
  };

  const handleNewSessionCreated = async () => {
    setShowNewSessionModal(false);
    await loadSessions();
  };

  if (editing) {
    return (
      <div className="px-4 py-3 overflow-y-auto">
        <h2 className="text-lg font-semibold text-gray-200 mb-3">Edit Todo</h2>
        <TodoForm
          initial={todo}
          sessions={sessions}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
          onCreateSession={() => setShowNewSessionModal(true)}
        />
        {showNewSessionModal && (
          <NewSessionModal
            onClose={() => setShowNewSessionModal(false)}
            onCreate={handleNewSessionCreated}
          />
        )}
      </div>
    );
  }

  const priority = priorityLabels[todo.priority];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <button
              onClick={handleToggle}
              className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                todo.completed
                  ? 'bg-claude border-claude'
                  : 'border-gray-500 hover:border-gray-300'
              }`}
            >
              {todo.completed && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <h2 className={`text-lg font-semibold ${
              todo.completed ? 'text-gray-500 line-through' : 'text-gray-200'
            }`}>
              {todo.title}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {!todo.sessionId && !todo.completed && (
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

        <div className="flex items-center gap-2 text-sm">
          <span className={`text-xs px-2 py-0.5 rounded ${priority.className}`}>
            {priority.text}
          </span>
          <div>
            <span className="text-gray-500">Created:</span>{' '}
            <span className="text-gray-300">{new Date(todo.createdAt).toLocaleString()}</span>
          </div>
          {todo.completedAt && (
            <div>
              <span className="text-gray-500">Completed:</span>{' '}
              <span className="text-gray-300">{new Date(todo.completedAt).toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {todo.description && (
          <div className="mb-3">
            <Collapsible title="Description" defaultOpen storageKey={`claudit:todo:${todo.id}:desc`}>
              <p className="text-sm text-gray-300 whitespace-pre-wrap bg-gray-800 rounded-lg p-2">
                {todo.description}
              </p>
            </Collapsible>
          </div>
        )}

        {todo.sessionId && (() => {
          const linkedSession = sessions.find(s => s.sessionId === todo.sessionId);
          return (
            <div className="mb-3">
              <Collapsible title="Linked Session" defaultOpen storageKey={`claudit:todo:${todo.id}:session`}>
                <div className="text-sm bg-gray-800 rounded-lg p-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-300">{todo.sessionLabel || todo.sessionId}</span>
                      <span className="text-gray-600 text-xs font-mono">{todo.sessionId}</span>
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
            </div>
          );
        })()}

        {!todo.description && !todo.sessionId && (
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
