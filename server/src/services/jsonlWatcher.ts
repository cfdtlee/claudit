import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

/**
 * Watches a JSONL session file for changes and emits new messages.
 * Used by Chat UI to get real-time updates without parsing PTY output.
 */
export class JsonlWatcher extends EventEmitter {
  private filePath: string;
  private watcher: fs.FSWatcher | null = null;
  private lastSize = 0;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly debounceMs: number;

  constructor(projectHash: string, sessionId: string, debounceMs = 300) {
    super();
    this.filePath = path.join(PROJECTS_DIR, projectHash, `${sessionId}.jsonl`);
    this.debounceMs = debounceMs;
  }

  start(): void {
    if (!fs.existsSync(this.filePath)) {
      console.warn(`[jsonl-watcher] File not found: ${this.filePath}`);
      return;
    }

    // Record initial size
    this.lastSize = fs.statSync(this.filePath).size;

    // Watch for changes
    try {
      this.watcher = fs.watch(this.filePath, (eventType) => {
        if (eventType === 'change') {
          this.scheduleCheck();
        }
      });

      this.watcher.on('error', (err) => {
        console.error(`[jsonl-watcher] Watch error: ${err.message}`);
      });

      console.log(`[jsonl-watcher] Watching ${path.basename(this.filePath)}`);
    } catch (err: any) {
      console.error(`[jsonl-watcher] Failed to watch: ${err.message}`);
    }
  }

  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  private scheduleCheck(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.checkForNewData(), this.debounceMs);
  }

  private checkForNewData(): void {
    try {
      const stat = fs.statSync(this.filePath);
      if (stat.size <= this.lastSize) return;

      // Read only the new bytes
      const fd = fs.openSync(this.filePath, 'r');
      const newBytes = Buffer.alloc(stat.size - this.lastSize);
      fs.readSync(fd, newBytes, 0, newBytes.length, this.lastSize);
      fs.closeSync(fd);

      this.lastSize = stat.size;

      // Parse new lines
      const newContent = newBytes.toString('utf-8');
      const lines = newContent.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          if (record.type === 'user' || record.type === 'assistant') {
            this.emit('message', record);
          }
        } catch {
          // Skip unparseable lines
        }
      }

      // Emit a generic change event (for Chat UI to trigger reload)
      this.emit('change');
    } catch (err: any) {
      // File might be temporarily locked during write
    }
  }
}

// Active watchers keyed by sessionId
const activeWatchers = new Map<string, JsonlWatcher>();

/**
 * Get or create a watcher for a session.
 */
export function getWatcher(projectHash: string, sessionId: string): JsonlWatcher {
  const key = `${projectHash}/${sessionId}`;
  let watcher = activeWatchers.get(key);
  if (!watcher) {
    watcher = new JsonlWatcher(projectHash, sessionId);
    watcher.start();
    activeWatchers.set(key, watcher);
  }
  return watcher;
}

/**
 * Stop and remove a watcher.
 */
export function stopWatcher(projectHash: string, sessionId: string): void {
  const key = `${projectHash}/${sessionId}`;
  const watcher = activeWatchers.get(key);
  if (watcher) {
    watcher.stop();
    activeWatchers.delete(key);
  }
}

/**
 * Stop all active watchers.
 */
export function stopAllWatchers(): void {
  for (const [, watcher] of activeWatchers) {
    watcher.stop();
  }
  activeWatchers.clear();
}
