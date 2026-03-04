import { useState } from 'react';
import { CronTask } from '../../types';
import { cn } from '../../lib/utils';
import { Save, X, FolderOpen } from 'lucide-react';
import FolderBrowser from '../FolderBrowser';
import CronExpressionBuilder from './CronExpressionBuilder';

interface Props {
  initial?: CronTask;
  onSubmit: (data: { name: string; cronExpression: string; prompt: string; projectPath?: string; enabled: boolean }) => void;
  onCancel: () => void;
}

export default function CronTaskForm({ initial, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [cronExpression, setCronExpression] = useState(initial?.cronExpression ?? '*/30 * * * *');
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [projectPath, setProjectPath] = useState(initial?.projectPath ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [showBrowser, setShowBrowser] = useState(false);

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.metaKey) {
      if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
      e.preventDefault();
    }
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      handleSubmitAction();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmitAction();
  };

  const handleSubmitAction = () => {
    onSubmit({
      name: name.trim(),
      cronExpression: cronExpression.trim(),
      prompt: prompt.trim(),
      projectPath: projectPath.trim() || undefined,
      enabled,
    });
  };

  const inputCls = 'w-full bg-background/80 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all';
  const labelCls = 'block text-xs text-muted-foreground mb-1.5 font-medium';

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-4">
      <div>
        <label className={labelCls}>Task Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          required
          className={inputCls}
          placeholder="e.g. Daily code review"
        />
      </div>
      <div>
        <label className={labelCls}>Schedule</label>
        <CronExpressionBuilder value={cronExpression} onChange={setCronExpression} />
      </div>
      <div>
        <label className={labelCls}>Prompt</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          required
          rows={5}
          className={cn(inputCls, 'resize-none')}
          placeholder="The prompt to send to Claude..."
        />
        <p className="text-xs text-muted-foreground/60 mt-1">
          Use <code className="text-muted-foreground bg-secondary px-1 rounded">{'{{todos}}'}</code> to inject pending todo list into the prompt
        </p>
      </div>
      <div>
        <label className={labelCls}>Project Path (optional)</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={projectPath}
            onChange={e => setProjectPath(e.target.value)}
            className={cn(inputCls, 'flex-1')}
            placeholder="/path/to/project"
          />
          <button
            type="button"
            onClick={() => setShowBrowser(!showBrowser)}
            className={cn(
              'px-3 py-2 text-sm rounded-lg transition-all flex items-center gap-1.5',
              showBrowser
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            )}
          >
            <FolderOpen className="w-3.5 h-3.5" /> Browse
          </button>
        </div>
        {showBrowser && (
          <div className="mt-2 p-3 bg-secondary/30 border border-border/50 rounded-lg">
            <FolderBrowser onPathChange={(path) => {
              setProjectPath(path);
            }} />
            <button
              type="button"
              onClick={() => {
                setShowBrowser(false);
                if (projectPath) {
                  try { localStorage.setItem('claudit:lastBrowserPath', projectPath); } catch {}
                }
              }}
              className="mt-2 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
          id="task-enabled"
          className="rounded bg-secondary border-border accent-primary"
        />
        <label htmlFor="task-enabled" className="text-sm text-foreground">Enabled</label>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors flex items-center gap-1"
        >
          <X className="w-3 h-3" /> Cancel
        </button>
        <button
          type="submit"
          className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all flex items-center gap-1.5 font-medium shadow-sm shadow-primary/20"
        >
          <Save className="w-3 h-3" /> {initial ? 'Save Changes' : 'Create Task'}
          <kbd className="text-[10px] opacity-70 bg-white/10 px-1 rounded">&#x2318;&#x21B5;</kbd>
        </button>
      </div>
    </form>
  );
}
