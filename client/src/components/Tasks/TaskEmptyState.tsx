import { useState, useEffect, useCallback, useRef } from 'react';
import { Project } from '../../types';
import { createTask } from '../../api/tasks';
import { fetchProjects } from '../../api/projects';
import { useUIStore } from '../../stores/useUIStore';
import { cn } from '../../lib/utils';
import { CheckSquare, Loader2, Plus, FolderOpen } from 'lucide-react';
import FolderBrowser from '../FolderBrowser';

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
  const [workingDir, setWorkingDir] = useState(() => taskDraft?.workingDir ?? '');
  const [projectId, setProjectId] = useState(() => taskDraft?.projectId ?? '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(err => console.error('Failed to load projects:', err));
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (title || description || priority !== 'medium' || workingDir || projectId) {
      setTaskDraft({ title, description, priority: PRIORITY_NUM[priority], workingDir: workingDir || undefined, projectId: projectId || undefined });
    }
  }, [title, description, priority, workingDir, projectId, setTaskDraft]);

  const handleProjectChange = (pid: string) => {
    setProjectId(pid);
    if (pid) {
      const project = projects.find(p => p.id === pid);
      if (project?.repoPath) setWorkingDir(project.repoPath);
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const task = await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        priority: PRIORITY_NUM[priority],
        workingDir: workingDir || undefined,
        projectId: projectId || undefined,
      });
      setTaskDraft(null);
      onTaskCreated(task.id);
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setSubmitting(false);
    }
  }, [title, description, priority, workingDir, projectId, submitting, onTaskCreated, setTaskDraft]);

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      descRef.current?.focus();
    }
  };

  const handleDescKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && !submitting) {
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
              title="Create task (⌘Enter)"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
              ) : (
                <Plus className="w-4 h-4 text-primary-foreground" />
              )}
            </button>
          </div>

          {/* Project / Working Directory */}
          <div className="flex items-center gap-2 px-3 pb-2.5 border-t border-border pt-2.5">
            <select
              value={projectId}
              onChange={e => handleProjectChange(e.target.value)}
              className="flex-1 text-xs text-muted-foreground bg-secondary/50 rounded-md px-2 py-1.5 border border-border outline-none focus:border-primary/50 transition-all"
            >
              <option value="">No project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setShowBrowser(!showBrowser)}
              className={cn(
                'text-xs px-2 py-1.5 rounded-md flex items-center gap-1 transition-all border',
                workingDir
                  ? 'bg-primary/10 text-primary border-primary/20'
                  : 'bg-secondary/50 text-muted-foreground border-border hover:text-foreground'
              )}
              title={workingDir || 'Browse for folder'}
            >
              <FolderOpen className="w-3 h-3" />
              {workingDir ? workingDir.split('/').pop() : 'Browse'}
            </button>
          </div>
          {showBrowser && (
            <div className="px-3 pb-2.5">
              <FolderBrowser onPathChange={(path) => { setWorkingDir(path); }} />
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  onClick={() => setShowBrowser(false)}
                  className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
          {workingDir && !showBrowser && (
            <div className="flex items-center gap-1.5 px-3 pb-2">
              <span className="text-[10px] text-muted-foreground/60 font-mono truncate" title={workingDir}>{workingDir}</span>
              <button type="button" onClick={() => { setWorkingDir(''); setProjectId(''); }} className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground">✕</button>
            </div>
          )}

        </div>
      </div>

      <div className="mt-4 text-xs text-muted-foreground/50">
        <kbd className="px-1.5 py-0.5 bg-secondary rounded-md border border-border text-muted-foreground font-mono text-[10px]">Enter</kbd> next field
        <span className="mx-2 text-border">|</span>
        <kbd className="px-1.5 py-0.5 bg-secondary rounded-md border border-border text-muted-foreground font-mono text-[10px]">⌘ Enter</kbd> create
      </div>
    </div>
  );
}
