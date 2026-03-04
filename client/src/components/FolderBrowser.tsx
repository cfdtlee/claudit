import { useState, useEffect, useCallback, useRef } from 'react';
import { listDirectory, DirectoryEntry, GitInfo } from '../api/sessions';
import { cn } from '../lib/utils';
import { Folder, ArrowUp, Loader2, AlertCircle, GitBranch } from 'lucide-react';

interface Props {
  onPathChange: (path: string, isGitRepo: boolean) => void;
}

export default function FolderBrowser({ onPathChange }: Props) {
  const [currentPath, setCurrentPath] = useState('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pathInput, setPathInput] = useState('');
  const onPathChangeRef = useRef(onPathChange);
  onPathChangeRef.current = onPathChange;

  const loadDir = useCallback(async (dirPath?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listDirectory(dirPath);
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setIsGitRepo(data.isGitRepo);
      setGitInfo(data.gitInfo || null);
      setEntries(data.entries);
      setPathInput(data.currentPath);
      onPathChangeRef.current(data.currentPath, data.isGitRepo);
      try { localStorage.setItem('claudit:lastBrowserPath', data.currentPath); } catch {}
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = (() => { try { return localStorage.getItem('claudit:lastBrowserPath'); } catch { return null; } })();
    loadDir(saved || undefined);
  }, [loadDir]);

  const handleGo = () => {
    if (pathInput.trim()) {
      loadDir(pathInput.trim());
    }
  };

  const inputCls = 'flex-1 text-sm bg-secondary/50 text-foreground px-3 py-2 rounded-lg border border-border outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 font-mono transition-all';

  return (
    <div className="flex flex-col gap-2">
      {/* Path input */}
      <div className="flex gap-1.5">
        <input
          value={pathInput}
          onChange={e => setPathInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleGo(); }}
          className={inputCls}
          placeholder="/path/to/directory"
        />
        <button
          onClick={handleGo}
          className="text-xs px-3 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors font-medium"
        >
          Go
        </button>
      </div>

      {/* Current path + git info */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="truncate font-mono">{currentPath}</span>
        {gitInfo && (
          <span className="flex items-center gap-1 flex-shrink-0 ml-auto text-primary">
            <GitBranch className="w-3 h-3" />
            <span>{gitInfo.repoName}</span>
            <span className="text-border">/</span>
            <span>{gitInfo.branch}</span>
          </span>
        )}
      </div>

      {/* Parent navigation */}
      {parentPath && (
        <button
          onClick={() => loadDir(parentPath)}
          className="text-left text-xs text-primary hover:text-primary/80 px-2 py-1 flex items-center gap-1 transition-colors"
        >
          <ArrowUp className="w-3 h-3" /> .. (parent directory)
        </button>
      )}

      {/* Directory listing */}
      <div className="max-h-60 overflow-y-auto border border-border rounded-lg">
        {loading && (
          <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Loading...
          </div>
        )}
        {error && (
          <div className="p-3 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="w-3 h-3" /> {error}
          </div>
        )}
        {!loading && !error && entries.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">No subdirectories</div>
        )}
        {!loading && !error && entries.map(entry => (
          <button
            key={entry.path}
            onClick={() => loadDir(entry.path)}
            className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-accent flex items-center gap-2 border-b border-border/30 last:border-b-0 transition-colors"
          >
            <Folder className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="truncate">{entry.name}</span>
            {entry.gitInfo && (
              <span className="ml-auto flex-shrink-0 text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                {entry.gitInfo.branch}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
