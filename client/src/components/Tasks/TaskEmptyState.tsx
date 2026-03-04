import { useState, useEffect, useCallback, useRef } from 'react';
import { SessionSummary } from '../../types';
import { createTask } from '../../api/tasks';
import { fetchSessions } from '../../api/sessions';
import { useUIStore } from '../../stores/useUIStore';
import { cn } from '../../lib/utils';
import { CheckSquare, Loader2, Send } from 'lucide-react';

interface Props {
  onTaskCreated: (id: string) => void;
}

const PRIORITY_NUM: Record<string, number> = { low: 1, medium: 2, high: 3 };

export default function TaskEmptyState({ onTaskCreated }: Props) {
  const taskDraft = useUIStore(s => s.taskDraft);
  const setTaskDraft = useUIStore(s => s.setTaskDraft);

  const [title, setTitle] = useState(() => taskDraft?.title ?? '');
  const [description, setDescription] = useState(() => taskDraft?.description ?? '');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(
    () => {
      const p = taskDraft?.priority;
      if (p === 1) return 'low';
      if (p === 3) return 'high';
      return 'medium';
    }
  );
  const [selectedSessionId, setSelectedSessionId] = useState(() => taskDraft?.selectedSessionId ?? '');
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchSessions(undefined, true)
      .then(groups => setSessions(groups.flatMap(g => g.sessions)))
      .catch(err => console.error('Failed to load sessions:', err));
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (title || description || priority !== 'medium' || selectedSessionId) {
      setTaskDraft({ title, description, priority: PRIORITY_NUM[priority], selectedSessionId });
    }
  }, [title, description, priority, selectedSessionId, setTaskDraft]);

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
      const task = await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        priority: PRIORITY_NUM[priority],
        sessionId,
        sessionLabel,
      });
      setTaskDraft(null);
      onTaskCreated(task.id);
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setSubmitting(false);
    }
  }, [title, description, priority, selectedSessionId, sessions, submitting, onTaskCreated, setTaskDraft]);

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
    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
      <div className="mb-6">
        <CheckSquare className="w-12 h-12 text-muted-foreground/20" />
      </div>

      <div className={cn('w-full max-w-[560px]', submitting && 'glow-border')}>
        <div className={cn(
          'bg-card backdrop-blur-xl rounded-xl border border-border overflow-hidden relative z-[1] shadow-lg shadow-black/30',
          submitting && 'glow-border-inner'
        )}>
          {/* Title input */}
          <div className="px-4 pt-4 pb-2">
            <input
              ref={inputRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              placeholder="What needs to be done?"
              className="w-full text-sm text-foreground placeholder-muted-foreground bg-transparent outline-none"
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
              className="w-full resize-none text-sm text-secondary-foreground placeholder-muted-foreground/50 bg-transparent outline-none"
              style={{ minHeight: '40px', maxHeight: '120px' }}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 px-3 pb-3 border-t border-border pt-2.5">
            <div className="flex gap-1">
              {(['low', 'medium', 'high'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-full capitalize transition-all font-medium',
                    priority === p
                      ? p === 'high' ? 'bg-red-500/10 text-red-400'
                        : p === 'medium' ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-secondary text-secondary-foreground'
                      : 'bg-secondary/30 text-muted-foreground hover:text-foreground'
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            <button
              onClick={handleSubmit}
              disabled={!title.trim() || submitting}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                'disabled:opacity-30 bg-primary hover:bg-primary/90',
                'shadow-sm shadow-primary/20'
              )}
              title="Create task (Enter)"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-primary-foreground" />
              )}
            </button>
          </div>

          {/* Session link */}
          <div className="flex items-center gap-2 px-3 pb-2.5 border-t border-border pt-2.5">
            <select
              value={selectedSessionId}
              onChange={e => setSelectedSessionId(e.target.value)}
              className="flex-1 text-xs text-muted-foreground bg-secondary/50 rounded-md px-2 py-1.5 border border-border outline-none focus:border-primary/50 transition-all"
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

      <div className="mt-4 text-xs text-muted-foreground/50">
        <kbd className="px-1.5 py-0.5 bg-secondary rounded-md border border-border text-muted-foreground font-mono text-[10px]">Enter</kbd> next field
        <span className="mx-2 text-border">|</span>
        <kbd className="px-1.5 py-0.5 bg-secondary rounded-md border border-border text-muted-foreground font-mono text-[10px]">Enter</kbd> in description to create
      </div>
    </div>
  );
}
