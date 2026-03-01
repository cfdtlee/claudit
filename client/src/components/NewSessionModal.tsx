import { useState, useCallback } from 'react';
import FolderBrowser from './FolderBrowser';

const MODEL_OPTIONS = [
  { value: 'opus', label: 'Opus' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'haiku', label: 'Haiku' },
];

const PERMISSION_OPTIONS = [
  { value: 'full', label: 'Full' },
  { value: 'default', label: 'Default' },
  { value: 'plan', label: 'Plan' },
  { value: 'ask', label: 'Ask' },
];

interface Props {
  onClose: () => void;
  onCreate: (projectPath: string, worktree?: { branchName: string }, model?: string, permissionMode?: string) => void;
}

export default function NewSessionModal({ onClose, onCreate }: Props) {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [useWorktree, setUseWorktree] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [model, setModel] = useState('opus');
  const [permissionMode, setPermissionMode] = useState('full');

  const handlePathChange = useCallback((path: string, gitRepo: boolean) => {
    setCurrentPath(path);
    setIsGitRepo(gitRepo);
    if (!gitRepo) {
      setUseWorktree(false);
      setBranchName('');
    }
  }, []);

  const handleCreate = () => {
    if (!currentPath) return;
    const worktree = useWorktree && branchName.trim()
      ? { branchName: branchName.trim() }
      : undefined;
    onCreate(currentPath, worktree, model, permissionMode);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[480px] max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-200 mb-4">New Session</h2>

        <FolderBrowser onPathChange={handlePathChange} />

        {/* Model & Permission selectors */}
        <div className="mt-3 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-400">Model</label>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1 outline-none focus:border-claude"
            >
              {MODEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-400">Permissions</label>
            <select
              value={permissionMode}
              onChange={e => setPermissionMode(e.target.value)}
              className="text-xs bg-gray-800 text-gray-200 border border-gray-700 rounded px-2 py-1 outline-none focus:border-claude"
            >
              {PERMISSION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Git worktree toggle — shown when browsing a git repo */}
        {isGitRepo && (
          <div className="mt-3 p-2 bg-gray-800/50 rounded border border-gray-700">
            <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={useWorktree}
                onChange={e => setUseWorktree(e.target.checked)}
                className="rounded bg-gray-800 border-gray-600"
              />
              Create git worktree
            </label>
            {useWorktree && (
              <input
                value={branchName}
                onChange={e => setBranchName(e.target.value)}
                placeholder="Branch name..."
                autoFocus
                className="mt-2 w-full text-sm bg-gray-800 text-gray-200 px-3 py-1.5 rounded border border-gray-600 outline-none focus:border-claude"
              />
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!currentPath || (useWorktree && !branchName.trim())}
            className="text-xs px-3 py-1.5 rounded bg-claude text-white hover:bg-claude-hover disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
