import { useState, useEffect, useCallback, useRef } from 'react';
import { SessionSummary } from '../../types';
import { createTodo } from '../../api/todo';
import { fetchSessions } from '../../api/sessions';
import { useUIStore } from '../../stores/useUIStore';

interface Props {
  onTodoCreated: (id: string) => void;
}

export default function TodoEmptyState({ onTodoCreated }: Props) {
  const todoDraft = useUIStore(s => s.todoDraft);
  const setTodoDraft = useUIStore(s => s.setTodoDraft);
  const todoSessionPrefill = useUIStore(s => s.todoSessionPrefill);
  const setTodoSessionPrefill = useUIStore(s => s.setTodoSessionPrefill);

  const [title, setTitle] = useState(() => todoDraft?.title ?? '');
  const [description, setDescription] = useState(() => todoDraft?.description ?? '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(() => todoDraft?.priority ?? 'medium');
  const [selectedSessionId, setSelectedSessionId] = useState(() => todoDraft?.selectedSessionId ?? '');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  // Load sessions for linking
  useEffect(() => {
    fetchSessions(undefined, true)
      .then(groups => setSessions(groups.flatMap(g => g.sessions)))
      .catch(err => console.error('Failed to load sessions:', err));
  }, []);

  // Apply prefill from session→todo flow
  useEffect(() => {
    if (todoSessionPrefill) {
      setSelectedSessionId(todoSessionPrefill.sessionId);
    }
  }, [todoSessionPrefill]);

  // Auto-focus title
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Persist draft on field changes
  useEffect(() => {
    if (title || description || priority !== 'medium' || selectedSessionId) {
      setTodoDraft({ title, description, priority, selectedSessionId });
    }
  }, [title, description, priority, selectedSessionId, setTodoDraft]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      let sessionId: string | undefined;
      let sessionLabel: string | undefined;

      if (selectedSessionId) {
        const session = sessions.find(s => s.sessionId === selectedSessionId);
        if (session) {
          sessionId = session.sessionId;
          sessionLabel = session.displayName || session.lastMessage;
        } else {
          sessionId = selectedSessionId;
        }
      }

      const todo = await createTodo({
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        sessionId,
        sessionLabel,
      });
      setTodoDraft(null);
      setTodoSessionPrefill(null);
      onTodoCreated(todo.id);
    } catch (err) {
      console.error('Failed to create todo:', err);
    } finally {
      setSubmitting(false);
    }
  }, [title, description, priority, selectedSessionId, sessions, submitting, onTodoCreated, setTodoDraft, setTodoSessionPrefill]);

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      descRef.current?.focus();
    }
  };

  const handleDescKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !submitting) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-950 relative overflow-hidden">
      {/* Icon */}
      <div className="mb-6">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-600">
          <path d="M9 11l3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      </div>

      {/* Creation card */}
      <div className={`w-full max-w-[560px] ${submitting ? 'glow-border' : ''}`}>
      <div className={`bg-gray-900 rounded-xl border border-gray-700 overflow-hidden relative z-[1] ${submitting ? 'glow-border-inner' : ''}`}>
        {/* Title input */}
        <div className="px-4 pt-3 pb-2">
          <input
            ref={inputRef}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder="What needs to be done?"
            className="w-full text-sm text-gray-200 placeholder-gray-500 bg-transparent outline-none"
          />
        </div>

        {/* Description */}
        <div className="px-4 pb-2">
          <textarea
            ref={descRef}
            value={description}
            onChange={e => setDescription(e.target.value)}
            onKeyDown={handleDescKeyDown}
            placeholder="Description (optional, Enter to create)"
            rows={2}
            className="w-full resize-none text-sm text-gray-300 placeholder-gray-600 bg-transparent outline-none"
            style={{ minHeight: '40px', maxHeight: '120px' }}
            onInput={e => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 120) + 'px';
            }}
          />
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 px-3 pb-3 border-t border-gray-800 pt-2.5">
          {/* Priority toggles */}
          <div className="flex gap-1">
            {(['low', 'medium', 'high'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`text-xs px-2.5 py-1 rounded-full capitalize transition-colors ${
                  priority === p
                    ? p === 'high' ? 'bg-red-900/50 text-red-400'
                      : p === 'medium' ? 'bg-yellow-900/50 text-yellow-400'
                      : 'bg-gray-700 text-gray-300'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || submitting}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 bg-claude hover:bg-claude-hover"
            title="Create todo (Enter)"
          >
            {submitting ? (
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" />
                <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            )}
          </button>
        </div>

        {/* Session link */}
        <div className="flex items-center gap-2 px-3 pb-2.5 border-t border-gray-800 pt-2.5">
          <select
            value={selectedSessionId}
            onChange={e => setSelectedSessionId(e.target.value)}
            className="flex-1 text-xs text-gray-400 bg-gray-800 rounded-md px-2 py-1 border border-gray-700 outline-none focus:border-claude"
          >
            <option value="">No linked session</option>
            {sessions.map(s => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.displayName || s.lastMessage || s.sessionId.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
      </div>
      </div>

      {/* Keyboard hint */}
      <div className="mt-4 text-xs text-gray-600">
        <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-500 font-mono text-[10px]">Enter</kbd> next field
        <span className="mx-2 text-gray-700">|</span>
        <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-500 font-mono text-[10px]">Enter</kbd> in description to create
      </div>
    </div>
  );
}
