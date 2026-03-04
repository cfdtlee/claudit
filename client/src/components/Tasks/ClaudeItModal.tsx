import { useState, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { X, Play, GitBranch } from 'lucide-react';
import FolderBrowser from '../FolderBrowser';

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

interface Props {
  onSelect: (projectPath: string, worktree?: { branchName: string }, model?: string, permissionMode?: string) => void;
  onClose: () => void;
}

export default function ClaudeItModal({ onSelect, onClose }: Props) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [useWorktree, setUseWorktree] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [model, setModel] = useState('opus');
  const [permissionMode, setPermissionMode] = useState('bypassPermissions');

  const handlePathChange = useCallback((path: string, gitRepo: boolean) => {
    setCurrentPath(path);
    setIsGitRepo(gitRepo);
    if (!gitRepo) {
      setUseWorktree(false);
      setBranchName('');
    }
  }, []);

  const handleStart = () => {
    if (!currentPath) return;
    try { localStorage.setItem('claudit:lastBrowserPath', currentPath); } catch {}
    const worktree = useWorktree && branchName.trim()
      ? { branchName: branchName.trim() }
      : undefined;
    onSelect(currentPath, worktree, model, permissionMode);
  };

  const inputCls = 'w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all';
  const labelCls = 'block text-xs text-muted-foreground mb-1 font-medium';

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl p-6 w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Claudit</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Pick a project directory to start a Claude session</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <FolderBrowser onPathChange={handlePathChange} />

        {/* Model & Permission */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Model</label>
            <select value={model} onChange={e => setModel(e.target.value)} className={inputCls}>
              {MODEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Permissions</label>
            <select value={permissionMode} onChange={e => setPermissionMode(e.target.value)} className={inputCls}>
              {PERMISSION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {isGitRepo && (
          <div className="mt-3 p-3 bg-secondary/30 rounded-lg border border-border/30">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={useWorktree}
                onChange={e => setUseWorktree(e.target.checked)}
                className="rounded bg-secondary border-border accent-primary"
              />
              <GitBranch className="w-3 h-3" /> Create git worktree
            </label>
            {useWorktree && (
              <input
                value={branchName}
                onChange={e => setBranchName(e.target.value)}
                placeholder="Branch name..."
                autoFocus
                className={cn(inputCls, 'mt-2')}
              />
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            disabled={!currentPath || (useWorktree && !branchName.trim())}
            className="text-xs px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all font-medium flex items-center gap-1.5 shadow-sm shadow-primary/20"
          >
            <Play className="w-3 h-3" /> Claudit
          </button>
        </div>
      </div>
    </div>
  );
}
