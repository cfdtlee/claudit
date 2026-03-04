import { useState, useEffect, useCallback, useRef } from 'react';
import { createCronTask } from '../../api/cron';
import { useUIStore } from '../../stores/useUIStore';
import { cn } from '../../lib/utils';
import { Workflow, Send, Loader2, Folder } from 'lucide-react';
import FolderBrowser from '../FolderBrowser';
import CronExpressionBuilder from './CronExpressionBuilder';

interface Props {
  onTaskCreated: (id: string) => void;
}

export default function CronTaskEmptyState({ onTaskCreated }: Props) {
  const cronDraft = useUIStore(s => s.cronDraft);
  const setCronDraft = useUIStore(s => s.setCronDraft);

  const [name, setName] = useState(() => cronDraft?.name ?? '');
  const [cronExpression, setCronExpression] = useState(() => cronDraft?.cronExpression ?? '*/30 * * * *');
  const [prompt, setPrompt] = useState(() => cronDraft?.prompt ?? '');
  const [projectPath, setProjectPath] = useState(() => {
    if (cronDraft?.projectPath) return cronDraft.projectPath;
    try { return localStorage.getItem('claudit:lastBrowserPath') || ''; }
    catch { return ''; }
  });
  const [enabled, setEnabled] = useState(() => cronDraft?.enabled ?? true);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLDivElement>(null);

  const folderName = projectPath ? projectPath.split('/').pop() || projectPath : '';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (name || prompt || projectPath || cronExpression !== '*/30 * * * *') {
      setCronDraft({ name, cronExpression, prompt, projectPath, enabled });
    }
  }, [name, cronExpression, prompt, projectPath, enabled, setCronDraft]);

  useEffect(() => {
    if (!showFolderPicker) return;
    const handler = (e: MouseEvent) => {
      if (folderRef.current && !folderRef.current.contains(e.target as Node)) {
        setShowFolderPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFolderPicker]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !prompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      const task = await createCronTask({
        name: name.trim(),
        cronExpression: cronExpression.trim(),
        prompt: prompt.trim(),
        projectPath: projectPath.trim() || undefined,
        enabled,
      });
      setCronDraft(null);
      onTaskCreated(task.id);
    } catch (err) {
      console.error('Failed to create cron task:', err);
    } finally {
      setSubmitting(false);
    }
  }, [name, cronExpression, prompt, projectPath, enabled, submitting, onTaskCreated, setCronDraft]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && !submitting) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePathChange = useCallback((path: string) => {
    setProjectPath(path);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
      <div className="mb-6">
        <Workflow className="w-12 h-12 text-muted-foreground/20" />
      </div>

      <div className={cn('w-full max-w-[560px]', submitting && 'glow-border')}>
        <div className={cn(
          'bg-card backdrop-blur-xl rounded-xl border border-border overflow-hidden relative z-[1] shadow-lg shadow-black/30',
          submitting && 'glow-border-inner'
        )}>
          {/* Name input */}
          <div className="px-4 pt-4 pb-2">
            <input
              ref={inputRef}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Workflow name..."
              className="w-full text-sm text-foreground placeholder-muted-foreground bg-transparent outline-none"
            />
          </div>

          {/* Prompt textarea */}
          <div className="px-4 pb-2">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Prompt to send to Claude..."
              rows={3}
              className="w-full resize-none text-sm text-secondary-foreground placeholder-muted-foreground/50 bg-transparent outline-none"
              style={{ minHeight: '60px', maxHeight: '160px' }}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 160) + 'px';
              }}
            />
          </div>

          {/* Schedule */}
          <div className="px-4 pb-3 border-t border-border/30 pt-3">
            <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-2">Schedule</div>
            <CronExpressionBuilder value={cronExpression} onChange={setCronExpression} />
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 px-3 pb-3 border-t border-border/30 pt-2.5">
            <button
              onClick={() => setShowFolderPicker(!showFolderPicker)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 rounded-md px-2 py-1 transition-colors border border-border/50"
            >
              <Folder className="w-3 h-3" />
              {folderName || 'Select folder'}
            </button>

            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="rounded w-3 h-3 bg-secondary border-border accent-primary"
              />
              Enabled
            </label>

            <div className="flex-1" />

            <button
              onClick={handleSubmit}
              disabled={!name.trim() || !prompt.trim() || submitting}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                'disabled:opacity-30 bg-primary hover:bg-primary/90',
                'shadow-sm shadow-primary/20'
              )}
              title="Create workflow"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-primary-foreground" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Folder picker */}
      {showFolderPicker && (
        <div
          ref={folderRef}
          className="w-full max-w-[560px] mt-2 bg-card backdrop-blur-xl rounded-xl border border-border p-4 z-10 shadow-xl animate-fade-in"
        >
          <FolderBrowser onPathChange={handlePathChange} />
          <div className="flex justify-end mt-3">
            <button
              onClick={() => setShowFolderPicker(false)}
              className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Keyboard hint */}
      <div className="mt-4 text-xs text-muted-foreground/60">
        Press <kbd className="px-1.5 py-0.5 bg-secondary rounded-md border border-border text-muted-foreground font-mono text-[10px]">&#8984;+Enter</kbd> to create
      </div>
    </div>
  );
}
