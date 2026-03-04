import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { Folder, Send, Loader2, GitBranch, AlertCircle, RefreshCw } from 'lucide-react';
import FolderBrowser from '../FolderBrowser';
import { useUIStore } from '../../stores/useUIStore';

interface Props {
  onCreateSession?: (projectPath: string, initialPrompt?: string, worktree?: { branchName: string }, model?: string, permissionMode?: string) => Promise<true | string>;
}

const MODEL_OPTIONS = [
  { value: 'opus', label: 'opus' },
  { value: 'sonnet', label: 'sonnet' },
  { value: 'haiku', label: 'haiku' },
];

const PERMISSION_OPTIONS = [
  { value: 'bypassPermissions', label: 'bypassPermissions' },
  { value: 'default', label: 'default' },
  { value: 'plan', label: 'plan' },
  { value: 'acceptEdits', label: 'acceptEdits' },
  { value: 'dontAsk', label: 'dontAsk' },
];

function Mascot({ running }: { running?: boolean }) {
  return (
    <svg width="64" height="64" viewBox="0 0 16 16" shapeRendering="crispEdges">
      <style>{`
        @keyframes legLeft {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-1.5px); }
        }
        @keyframes legRight {
          0%, 100% { transform: translateY(-1.5px); }
          50% { transform: translateY(0); }
        }
        @keyframes bodyBounce {
          0%, 100% { transform: translateY(0); }
          25% { transform: translateY(-0.5px); }
          75% { transform: translateY(0.5px); }
        }
        .leg-left { animation: ${running ? 'legLeft 0.25s ease-in-out infinite' : 'none'}; }
        .leg-right { animation: ${running ? 'legRight 0.25s ease-in-out infinite' : 'none'}; }
        .body { animation: ${running ? 'bodyBounce 0.25s ease-in-out infinite' : 'none'}; }
      `}</style>
      <rect className="leg-left" x="2" y="13" width="1" height="3" fill="#c07040" />
      <rect className="leg-left" x="10" y="13" width="1" height="3" fill="#c07040" />
      <rect className="leg-right" x="5" y="13" width="1" height="3" fill="#c07040" />
      <rect className="leg-right" x="13" y="13" width="1" height="3" fill="#c07040" />
      <g className="body">
        <rect x="2" y="6" width="12" height="7" fill="#DA7756" rx="1" />
        <rect x="3" y="7" width="10" height="5" fill="#daa06d" />
        <rect x="5" y="9" width="2" height="2" fill="#2d2d2d" />
        <rect x="9" y="9" width="2" height="2" fill="#2d2d2d" />
        <rect x="5" y="9" width="1" height="1" fill="#4a4a4a" />
        <rect x="9" y="9" width="1" height="1" fill="#4a4a4a" />
      </g>
    </svg>
  );
}

export default function EmptyState({ onCreateSession }: Props) {
  const sessionDraft = useUIStore(s => s.sessionDraft);
  const setSessionDraft = useUIStore(s => s.setSessionDraft);

  const [prompt, setPrompt] = useState(() => sessionDraft?.prompt ?? '');
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [projectPath, setProjectPath] = useState(() => {
    if (sessionDraft?.projectPath) return sessionDraft.projectPath;
    try { return localStorage.getItem('claudit:lastBrowserPath') || ''; }
    catch { return ''; }
  });
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [useWorktree, setUseWorktree] = useState(() => sessionDraft?.useWorktree ?? false);
  const [branchName, setBranchName] = useState(() => sessionDraft?.branchName ?? '');
  const [model, setModel] = useState('opus');
  const [permissionMode, setPermissionMode] = useState('bypassPermissions');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const folderRef = useRef<HTMLDivElement>(null);

  const folderName = projectPath ? projectPath.split('/').pop() || projectPath : '';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (prompt || projectPath || useWorktree || branchName) {
      setSessionDraft({ prompt, projectPath, useWorktree, branchName });
    }
  }, [prompt, projectPath, useWorktree, branchName, setSessionDraft]);

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
    if (!projectPath || !onCreateSession || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const worktree = useWorktree && branchName.trim() ? { branchName: branchName.trim() } : undefined;
      const result = await onCreateSession(projectPath, prompt.trim() || undefined, worktree, model, permissionMode);
      if (result === true) {
        setPrompt('');
        setSessionDraft(null);
      } else {
        setError(result);
      }
    } finally {
      setSubmitting(false);
    }
  }, [projectPath, prompt, onCreateSession, useWorktree, branchName, submitting]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey && !submitting) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePathChange = useCallback((path: string, gitRepo: boolean) => {
    setProjectPath(path);
    setIsGitRepo(gitRepo);
    setError(null);
  }, []);

  const selectCls = 'text-[11px] bg-secondary text-secondary-foreground border border-border rounded-md px-2 py-1 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all';

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Mascot */}
      <div className="mb-6">
        <Mascot running={submitting} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="w-full max-w-[560px] mb-3 bg-destructive/5 border border-destructive/20 rounded-xl px-4 py-3 flex items-center gap-3 animate-slide-in">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
          <span className="text-destructive text-sm flex-1">{error}</span>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="text-xs px-3 py-1.5 bg-destructive/10 hover:bg-destructive/20 text-destructive rounded-lg transition-colors flex-shrink-0 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" /> Retry
          </button>
        </div>
      )}

      {/* Input card */}
      <div className={cn('w-full max-w-[560px]', submitting && 'glow-border')}>
        <div className={cn(
          'bg-card/40 backdrop-blur-xl rounded-xl border border-border/30 overflow-hidden relative z-[1] shadow-lg shadow-black/20',
          submitting && 'glow-border-inner'
        )}>
          {/* Prompt textarea */}
          <div className="px-4 pt-4 pb-2">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={e => { setPrompt(e.target.value); setError(null); }}
              onKeyDown={handleKeyDown}
              placeholder="Describe a task for Claude..."
              rows={1}
              className="w-full resize-none text-sm text-foreground placeholder-muted-foreground bg-transparent outline-none"
              style={{ minHeight: '24px', maxHeight: '120px' }}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-2 px-3 pb-3">
            <div className="flex-1" />
            <button
              onClick={handleSubmit}
              disabled={!projectPath || submitting}
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
                'disabled:opacity-30 bg-primary hover:bg-primary/90',
                'shadow-sm shadow-primary/20'
              )}
              title={projectPath ? 'Create session' : 'Select a project folder first'}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-primary-foreground" />
              )}
            </button>
          </div>

          {/* Project path bar */}
          <div className="flex items-center gap-2 px-3 pb-2.5 border-t border-border pt-2.5">
            <button
              onClick={() => setShowFolderPicker(!showFolderPicker)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 rounded-md px-2 py-1 transition-colors border border-border/50"
            >
              <Folder className="w-3 h-3" />
              {folderName || 'Select folder'}
            </button>

            {isGitRepo && (
              <span className="text-[10px] text-muted-foreground bg-secondary rounded-md px-1.5 py-0.5 border border-border/50 flex items-center gap-1">
                <GitBranch className="w-2.5 h-2.5" /> git
              </span>
            )}

            {isGitRepo && (
              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer ml-auto">
                <input
                  type="checkbox"
                  checked={useWorktree}
                  onChange={e => setUseWorktree(e.target.checked)}
                  className="rounded w-3 h-3 bg-secondary border-border accent-primary"
                />
                worktree
              </label>
            )}
          </div>

          {/* Model & Permission */}
          <div className="flex items-center gap-3 px-3 pb-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground font-medium">Model</span>
              <select value={model} onChange={e => setModel(e.target.value)} className={selectCls}>
                {MODEL_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground font-medium">Permissions</span>
              <select value={permissionMode} onChange={e => setPermissionMode(e.target.value)} className={selectCls}>
                {PERMISSION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Branch name input */}
          {useWorktree && (
            <div className="px-3 pb-2.5">
              <input
                value={branchName}
                onChange={e => setBranchName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Branch name..."
                autoFocus
                className="w-full text-xs text-foreground bg-secondary px-2.5 py-1.5 rounded-md border border-border outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 placeholder-muted-foreground transition-all"
              />
            </div>
          )}
        </div>
      </div>

      {/* Folder picker */}
      {showFolderPicker && (
        <div
          ref={folderRef}
          className="w-full max-w-[560px] mt-2 bg-card/40 backdrop-blur-xl rounded-xl border border-border/30 p-4 z-10 shadow-xl animate-fade-in"
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
