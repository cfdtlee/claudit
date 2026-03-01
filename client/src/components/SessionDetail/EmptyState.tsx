import { useState, useRef, useEffect, useCallback } from 'react';
import FolderBrowser from '../FolderBrowser';
import { useUIStore } from '../../stores/useUIStore';

interface Props {
  onCreateSession?: (projectPath: string, initialPrompt?: string, worktree?: { branchName: string }, model?: string, permissionMode?: string) => Promise<true | string>;
}

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
      {/* Left legs */}
      <rect className="leg-left" x="2" y="13" width="1" height="3" fill="#c07040" />
      <rect className="leg-left" x="10" y="13" width="1" height="3" fill="#c07040" />
      {/* Right legs */}
      <rect className="leg-right" x="5" y="13" width="1" height="3" fill="#c07040" />
      <rect className="leg-right" x="13" y="13" width="1" height="3" fill="#c07040" />
      {/* Body */}
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
  const [permissionMode, setPermissionMode] = useState('full');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const folderRef = useRef<HTMLDivElement>(null);

  const folderName = projectPath ? projectPath.split('/').pop() || projectPath : '';

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Persist draft on field changes
  useEffect(() => {
    if (prompt || projectPath || useWorktree || branchName) {
      setSessionDraft({ prompt, projectPath, useWorktree, branchName });
    }
  }, [prompt, projectPath, useWorktree, branchName, setSessionDraft]);

  // Close folder picker on click outside
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

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-gray-950 relative overflow-hidden">
      {/* Mascot */}
      <div className="mb-6">
        <Mascot running={submitting} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="w-full max-w-[560px] mb-3 bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="text-red-400 text-sm flex-1">{error}</span>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="text-xs px-3 py-1.5 bg-red-800/50 hover:bg-red-700/50 text-red-300 rounded-lg transition-colors flex-shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Input card */}
      <div className="w-full max-w-[560px] bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
        {/* Prompt textarea */}
        <div className="px-4 pt-3 pb-2">
          <textarea
            ref={inputRef}
            value={prompt}
            onChange={e => { setPrompt(e.target.value); setError(null); }}
            onKeyDown={handleKeyDown}
            placeholder="Describe a task for Claude..."
            rows={1}
            className="w-full resize-none text-sm text-gray-200 placeholder-gray-500 bg-transparent outline-none"
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
          <button
            onClick={() => setShowFolderPicker(!showFolderPicker)}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1"
            title="Change folder"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <div className="flex-1" />

          {/* Send button */}
          <button
            onClick={handleSubmit}
            disabled={!projectPath || submitting}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30 bg-claude hover:bg-claude-hover"
            title={projectPath ? 'Create session (⌘+Enter)' : 'Select a project folder first'}
          >
            {submitting ? (
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4" />
                <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </div>

        {/* Project path bar */}
        <div className="flex items-center gap-2 px-3 pb-2.5 border-t border-gray-800 pt-2.5">
          <button
            onClick={() => setShowFolderPicker(!showFolderPicker)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 bg-gray-800 hover:bg-gray-750 rounded-md px-2 py-1 transition-colors border border-gray-700"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            {folderName || 'Select folder'}
          </button>

          {isGitRepo && (
            <span className="text-[10px] text-gray-500 bg-gray-800 rounded px-1.5 py-0.5 border border-gray-700">
              git
            </span>
          )}

          {isGitRepo && (
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={useWorktree}
                onChange={e => setUseWorktree(e.target.checked)}
                className="rounded w-3 h-3 bg-gray-800 border-gray-600"
              />
              worktree
            </label>
          )}
        </div>

        {/* Model & Permission selectors */}
        <div className="flex items-center gap-2 px-3 pb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">Model</span>
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="text-[11px] bg-gray-800 text-gray-300 border border-gray-700 rounded px-1.5 py-0.5 outline-none focus:border-gray-500"
            >
              {MODEL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">Permissions</span>
            <select
              value={permissionMode}
              onChange={e => setPermissionMode(e.target.value)}
              className="text-[11px] bg-gray-800 text-gray-300 border border-gray-700 rounded px-1.5 py-0.5 outline-none focus:border-gray-500"
            >
              {PERMISSION_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Branch name input for worktree */}
        {useWorktree && (
          <div className="px-3 pb-2.5">
            <input
              value={branchName}
              onChange={e => setBranchName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Branch name..."
              autoFocus
              className="w-full text-xs text-gray-300 bg-gray-800 px-2.5 py-1.5 rounded-md border border-gray-700 outline-none focus:border-gray-500 placeholder-gray-600"
            />
          </div>
        )}
      </div>

      {/* Folder picker dropdown */}
      {showFolderPicker && (
        <div
          ref={folderRef}
          className="w-full max-w-[560px] mt-2 bg-gray-900 rounded-xl border border-gray-700 p-4 z-10"
        >
          <FolderBrowser onPathChange={handlePathChange} />
          <div className="flex justify-end mt-3">
            <button
              onClick={() => setShowFolderPicker(false)}
              className="text-xs px-3 py-1.5 rounded bg-claude text-white hover:bg-claude-hover transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Keyboard hint */}
      <div className="mt-4 text-xs text-gray-600">
        Press <kbd className="px-1.5 py-0.5 bg-gray-800 rounded border border-gray-700 text-gray-500 font-mono text-[10px]">⌘+Enter</kbd> to create
      </div>
    </div>
  );
}
