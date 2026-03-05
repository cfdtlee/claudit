import { useState, useEffect, useRef, useCallback } from 'react';
import { Task, SessionSummary, Project } from '../../types';
import { fetchProjects } from '../../api/projects';
import { cn } from '../../lib/utils';
import { Save, X, FolderOpen } from 'lucide-react';
import FolderBrowser from '../FolderBrowser';

const PRIORITY_MAP: Record<number, string> = { 1: 'low', 2: 'medium', 3: 'high' };
const PRIORITY_NUM: Record<string, number> = { low: 1, medium: 2, high: 3 };

interface Props {
  initial?: Partial<Task>;
  sessions?: SessionSummary[];
  prefillSessionId?: string;
  onSubmit: (data: Partial<Task>) => void;
  onCancel: () => void;
  onCreateSession?: () => void;
}

export default function TaskForm({ initial, sessions, prefillSessionId, onSubmit, onCancel, onCreateSession }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [priority, setPriority] = useState<string>(
    PRIORITY_MAP[initial?.priority ?? 2] ?? 'medium'
  );
  const [selectedSessionId, setSelectedSessionId] = useState(initial?.sessionId ?? prefillSessionId ?? '');
  const [workingDir, setWorkingDir] = useState(initial?.workingDir ?? '');
  const [projectId, setProjectId] = useState(initial?.projectId ?? '');
  const [projects, setProjects] = useState<Project[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, []);

  useEffect(() => { autoResize(); }, [autoResize]);

  useEffect(() => {
    fetchProjects().then(setProjects).catch(console.error);
  }, []);

  const handleProjectChange = (pid: string) => {
    setProjectId(pid);
    if (pid) {
      const project = projects.find(p => p.id === pid);
      if (project?.repoPath) setWorkingDir(project.repoPath);
    }
  };

  useEffect(() => {
    if (prefillSessionId) setSelectedSessionId(prefillSessionId);
  }, [prefillSessionId]);

  const handleSessionChange = (value: string) => {
    if (value === '__new__') {
      onCreateSession?.();
      return;
    }
    setSelectedSessionId(value);
  };

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
    if (!title.trim()) return;
    let sessionId: string | undefined;
    let sessionLabel: string | undefined;
    if (selectedSessionId && sessions) {
      const session = sessions.find(s => s.sessionId === selectedSessionId);
      if (session) {
        sessionId = session.sessionId;
        sessionLabel = session.displayName || session.lastMessage;
      }
    } else if (selectedSessionId) {
      sessionId = selectedSessionId;
    }
    onSubmit({
      title: title.trim(),
      description: description.trim() || undefined,
      priority: PRIORITY_NUM[priority],
      sessionId,
      sessionLabel,
      workingDir: workingDir || undefined,
      projectId: projectId || undefined,
    });
  };

  const inputCls = 'w-full bg-background/80 border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all';
  const labelCls = 'block text-xs text-muted-foreground mb-1.5 font-medium';

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-4">
      <div>
        <label className={labelCls}>Title *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={inputCls}
          placeholder="What needs to be done?"
          autoFocus
        />
      </div>

      <div>
        <label className={labelCls}>Description</label>
        <textarea
          ref={textareaRef}
          value={description}
          onChange={e => { setDescription(e.target.value); autoResize(); }}
          className={cn(inputCls, 'resize-none min-h-[72px]')}
          placeholder="Optional details..."
        />
      </div>

      <div>
        <label className={labelCls}>Priority</label>
        <div className="flex gap-2">
          {(['low', 'medium', 'high'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPriority(p)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-lg capitalize transition-all font-medium',
                priority === p
                  ? p === 'high' ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : p === 'medium' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                    : 'bg-secondary text-secondary-foreground border border-border'
                  : 'bg-secondary/30 text-muted-foreground hover:text-foreground border border-transparent'
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={labelCls}>Project / Working Directory</label>
        <div className="flex gap-2">
          <select
            value={projectId}
            onChange={e => handleProjectChange(e.target.value)}
            className={cn(inputCls, 'flex-1')}
          >
            <option value="">(No project)</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowBrowser(!showBrowser)}
            className={cn(
              'text-xs px-3 py-2.5 rounded-lg flex items-center gap-1.5 transition-all border whitespace-nowrap',
              workingDir
                ? 'bg-primary/10 text-primary border-primary/20'
                : 'bg-background/80 text-muted-foreground border-border hover:text-foreground'
            )}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Browse
          </button>
        </div>
        {showBrowser && (
          <div className="mt-2">
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
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="text-xs text-muted-foreground font-mono truncate" title={workingDir}>{workingDir}</span>
            <button type="button" onClick={() => { setWorkingDir(''); setProjectId(''); }} className="text-xs text-muted-foreground/50 hover:text-muted-foreground">✕</button>
          </div>
        )}
      </div>

      <div>
        <label className={labelCls}>Linked Session</label>
        {sessions ? (
          <select
            value={selectedSessionId}
            onChange={e => handleSessionChange(e.target.value)}
            className={inputCls}
          >
            <option value="">(No session)</option>
            {sessions.map(s => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.displayName || s.lastMessage || s.sessionId.slice(0, 8)}
              </option>
            ))}
            {onCreateSession && (
              <option value="__new__">+ New Session...</option>
            )}
          </select>
        ) : (
          <input
            type="text"
            value={selectedSessionId}
            onChange={e => setSelectedSessionId(e.target.value)}
            className={inputCls}
            placeholder="Session ID"
          />
        )}
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
          disabled={!title.trim()}
          className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-1.5 font-medium shadow-sm shadow-primary/20"
        >
          <Save className="w-3 h-3" /> {initial?.id ? 'Save' : 'Create'}
          <kbd className="text-[10px] opacity-70 bg-white/10 px-1 rounded">&#x2318;&#x21B5;</kbd>
        </button>
      </div>
    </form>
  );
}
