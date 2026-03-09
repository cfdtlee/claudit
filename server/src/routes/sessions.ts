import { Router } from 'express';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CLAUDE_BIN } from '../services/claudeProcess.js';
import { getSessionIndex, invalidateSessionCache } from '../services/historyIndex.js';
import { parseSession } from '../services/sessionParser.js';
import { getSlugFromSession } from '../services/sessionScanner.js';
import { MergedSessionDetail } from '../types.js';
import { addManagedSession, renameManagedSession, archiveManagedSession, removeManagedSession, pinManagedSession } from '../services/managedSessions.js';
import { eventBus } from '../services/eventBus.js';
import { updateLastViewedMtime } from '../services/sessionIndexCache.js';

const router = Router();

// GET /api/sessions?q=keyword&hideEmpty=true&managedOnly=true
router.get('/', (req, res) => {
  try {
    const query = req.query.q as string | undefined;
    const hideEmpty = req.query.hideEmpty === 'true';
    const managedOnly = req.query.managedOnly === 'true';
    const groups = getSessionIndex(query, hideEmpty, managedOnly);
    res.json(groups);
  } catch (err) {
    console.error('Error fetching sessions:', err);
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// POST /api/sessions/new — create a fresh claude session
router.post('/new', async (req, res) => {
  try {
    const { projectPath, worktree, displayName, initialPrompt, model, permissionMode } = req.body;
    if (!projectPath || typeof projectPath !== 'string') {
      res.status(400).json({ error: 'projectPath is required' });
      return;
    }
    if (!fs.existsSync(projectPath)) {
      res.status(400).json({ error: 'projectPath does not exist' });
      return;
    }

    let actualProjectPath = projectPath;

    // Handle git worktree creation
    if (worktree?.branchName) {
      const gitDir = path.join(projectPath, '.git');
      if (!fs.existsSync(gitDir)) {
        res.status(400).json({ error: 'Source path is not a git repository' });
        return;
      }
      const worktreePath = path.join(path.dirname(projectPath), `${path.basename(projectPath)}-${worktree.branchName}`);
      try {
        execSync(`git worktree add ${JSON.stringify(worktreePath)} -b ${JSON.stringify(worktree.branchName)}`, {
          cwd: projectPath, encoding: 'utf-8', timeout: 15_000,
        });
      } catch {
        // Branch may already exist — try without -b
        try {
          execSync(`git worktree add ${JSON.stringify(worktreePath)} ${JSON.stringify(worktree.branchName)}`, {
            cwd: projectPath, encoding: 'utf-8', timeout: 15_000,
          });
        } catch (e: any) {
          res.status(500).json({ error: `Failed to create worktree: ${e.message}` });
          return;
        }
      }
      actualProjectPath = worktreePath;
    }

    // Create a minimal session — just get the session_id, don't wait for a full response
    const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE'));

    // Build CLI flags — use --max-turns 1 with a trivial prompt to get session_id fast
    const cliFlags: string[] = ['-p', '--output-format', 'json', '--max-turns', '1'];
    if (model && typeof model === 'string') {
      cliFlags.push('--model', model);
    }
    if (permissionMode === 'bypassPermissions' || !permissionMode) {
      cliFlags.push('--dangerously-skip-permissions');
    } else {
      cliFlags.push('--permission-mode', permissionMode);
    }

    let sessionId: string | undefined;
    try {
      // Use spawn instead of execSync to stream output and extract session_id ASAP
      sessionId = await new Promise<string>((resolve, reject) => {
        const proc = spawn(CLAUDE_BIN, cliFlags, {
          cwd: actualProjectPath,
          env: cleanEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk: Buffer) => {
          stdout += chunk.toString();
          // Try to extract session_id from partial output
          for (const line of stdout.split('\n')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.session_id) {
                proc.kill();
                resolve(parsed.session_id);
                return;
              }
            } catch { /* not complete JSON yet */ }
          }
        });

        proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
          reject(new Error('Session creation timed out after 60s'));
        }, 60_000);

        proc.on('close', (code) => {
          clearTimeout(timer);
          // Final attempt to parse session_id
          for (const line of stdout.split('\n')) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.session_id) {
                resolve(parsed.session_id);
                return;
              }
            } catch { /* skip */ }
          }
          reject(new Error(`Failed to get session_id (exit=${code}): ${(stderr || stdout).slice(0, 200)}`));
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });

        // Send a trivial prompt to minimize Claude response time
        proc.stdin.write('hi');
        proc.stdin.end();
      });
    } catch (e: any) {
      console.error(`[session] Claude CLI failed:`, e.message);
      res.status(500).json({ error: `Failed to create session: ${e.message}` });
      return;
    }
    if (!sessionId) {
      res.status(500).json({ error: 'Failed to get session ID from claude output' });
      return;
    }

    // Compute project hash
    const projectHash = actualProjectPath.replace(/\//g, '-');

    // Record in managed store
    addManagedSession(sessionId, actualProjectPath);
    if (displayName) {
      renameManagedSession(sessionId, displayName);
    }

    // Invalidate cache so the new session shows up
    invalidateSessionCache();

    eventBus.emitSessionEvent({ type: 'session:created', sessionId });

    res.json({ sessionId, projectPath: actualProjectPath, projectHash });
  } catch (err: any) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: err.message || 'Failed to create session' });
  }
});

// GET /api/sessions/search?q=keyword — full-text search inside session JSONL content
router.get('/search', (req, res) => {
  try {
    const query = (req.query.q as string || '').trim().toLowerCase();
    if (!query) {
      res.json({ results: [] });
      return;
    }

    const groups = getSessionIndex(undefined, true, false);
    const MAX_BYTES = 500 * 1024; // 500KB per file
    const results: { sessionId: string; projectHash: string; projectPath: string; snippet: string; matchCount: number }[] = [];

    outer: for (const group of groups) {
      for (const session of group.sessions) {
        const filePath = path.join(os.homedir(), '.claude', 'projects', group.projectHash, `${session.sessionId}.jsonl`);
        if (!fs.existsSync(filePath)) continue;

        try {
          const fd = fs.openSync(filePath, 'r');
          const buf = Buffer.alloc(MAX_BYTES);
          const bytesRead = fs.readSync(fd, buf, 0, MAX_BYTES, 0);
          fs.closeSync(fd);
          const content = buf.toString('utf-8', 0, bytesRead);
          const lines = content.split('\n');

          let matchCount = 0;
          let snippet = '';

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const parsed = JSON.parse(line);
              // Extract text from message content
              const texts: string[] = [];
              if (parsed.message?.content) {
                if (typeof parsed.message.content === 'string') {
                  texts.push(parsed.message.content);
                } else if (Array.isArray(parsed.message.content)) {
                  for (const block of parsed.message.content) {
                    if (block.text) texts.push(block.text);
                    if (block.thinking) texts.push(block.thinking);
                    if (typeof block.content === 'string') texts.push(block.content);
                  }
                }
              }
              for (const text of texts) {
                const lower = text.toLowerCase();
                let idx = -1;
                while ((idx = lower.indexOf(query, idx + 1)) !== -1) {
                  matchCount++;
                  if (!snippet) {
                    const start = Math.max(0, idx - 40);
                    const end = Math.min(text.length, idx + query.length + 40);
                    snippet = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
                  }
                }
              }
            } catch {
              // skip malformed lines
            }
          }

          if (matchCount > 0) {
            results.push({
              sessionId: session.sessionId,
              projectHash: group.projectHash,
              projectPath: group.projectPath,
              snippet,
              matchCount,
            });
            if (results.length >= 50) break outer;
          }
        } catch {
          // skip unreadable files
        }
      }
    }

    // Sort by match count desc
    results.sort((a, b) => b.matchCount - a.matchCount);
    res.json({ results: results.slice(0, 50) });
  } catch (err) {
    console.error('Error searching sessions:', err);
    res.status(500).json({ error: 'Failed to search sessions' });
  }
});

// GET /api/sessions/archived — return archived sessions
router.get('/archived', (req, res) => {
  try {
    const groups = getSessionIndex(undefined, false, false, true);
    const count = groups.reduce((sum, g) => sum + g.sessions.length, 0);
    res.json({ count, groups });
  } catch (err) {
    console.error('Error fetching archived sessions:', err);
    res.status(500).json({ error: 'Failed to fetch archived sessions' });
  }
});

// PATCH /api/sessions/:sessionId/seen — mark session as viewed
router.patch('/:sessionId/seen', (req, res) => {
  try {
    const { sessionId } = req.params;

    // Find the session's JSONL file to read its current mtime
    const projectDirs = fs.readdirSync(path.join(os.homedir(), '.claude', 'projects'), { withFileTypes: true });
    let found = false;
    for (const dir of projectDirs) {
      if (!dir.isDirectory()) continue;
      const filePath = path.join(os.homedir(), '.claude', 'projects', dir.name, `${sessionId}.jsonl`);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        updateLastViewedMtime(sessionId, stat.mtimeMs);
        found = true;
        break;
      }
    }

    if (!found) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    invalidateSessionCache();
    eventBus.emitSessionEvent({ type: 'session:updated', sessionId });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Error marking session seen:', err);
    res.status(500).json({ error: err.message || 'Failed to mark session seen' });
  }
});

// PATCH /api/sessions/:sessionId/pin — pin or unpin a session
router.patch('/:sessionId/pin', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { pinned } = req.body;
    if (typeof pinned !== 'boolean') {
      res.status(400).json({ error: 'pinned (boolean) is required' });
      return;
    }
    pinManagedSession(sessionId, pinned);
    invalidateSessionCache();
    eventBus.emitSessionEvent({ type: 'session:updated', sessionId });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Error pinning session:', err);
    res.status(500).json({ error: err.message || 'Failed to pin session' });
  }
});

// PATCH /api/sessions/:sessionId/archive — archive or unarchive a session
router.patch('/:sessionId/archive', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { archived } = req.body;
    if (typeof archived !== 'boolean') {
      res.status(400).json({ error: 'archived (boolean) is required' });
      return;
    }
    archiveManagedSession(sessionId, archived);
    invalidateSessionCache();
    eventBus.emitSessionEvent({ type: 'session:archived', sessionId });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Error archiving session:', err);
    res.status(500).json({ error: err.message || 'Failed to archive session' });
  }
});

// PATCH /api/sessions/:sessionId/name — rename a session
router.patch('/:sessionId/name', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { name } = req.body;
    if (typeof name !== 'string') {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    let entry = renameManagedSession(sessionId, name);
    if (!entry) {
      // Session not in managed store — add it so we can still rename
      addManagedSession(sessionId, '');
      entry = renameManagedSession(sessionId, name);
    }

    // Invalidate cache so the new name shows up
    invalidateSessionCache();

    eventBus.emitSessionEvent({ type: 'session:updated', sessionId });

    res.json({ ok: true });
  } catch (err: any) {
    console.error('Error renaming session:', err);
    res.status(500).json({ error: err.message || 'Failed to rename session' });
  }
});

// GET /api/sessions/merged/:projectHash/:slug — merged conversation from all sessions sharing this slug
router.get('/merged/:projectHash/:slug', (req, res) => {
  try {
    const { projectHash, slug } = req.params;
    const projectDir = path.join(os.homedir(), '.claude', 'projects', projectHash);

    if (!fs.existsSync(projectDir)) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    // Find all session files with this slug
    const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
    const matchingFiles: { sessionId: string; filePath: string }[] = [];

    for (const file of files) {
      const filePath = path.join(projectDir, file);
      const fileSlug = getSlugFromSession(filePath);
      if (fileSlug === slug) {
        matchingFiles.push({ sessionId: file.replace('.jsonl', ''), filePath });
      }
    }

    if (matchingFiles.length === 0) {
      res.status(404).json({ error: 'No sessions found with this slug' });
      return;
    }

    // Parse each session
    const parsed = matchingFiles.map(({ sessionId }) => {
      const detail = parseSession(projectHash, sessionId);
      return { sessionId, detail };
    });

    // Sort by first message timestamp (chronological order)
    parsed.sort((a, b) => {
      const aTs = a.detail.messages[0]?.timestamp || '';
      const bTs = b.detail.messages[0]?.timestamp || '';
      return aTs.localeCompare(bTs);
    });

    // Concatenate
    const allMessages: MergedSessionDetail['messages'] = [];
    const sessionBoundaries: number[] = [];
    const sessionIds: string[] = [];
    let projectPath = projectHash;

    for (const { sessionId, detail } of parsed) {
      sessionIds.push(sessionId);
      sessionBoundaries.push(allMessages.length);
      allMessages.push(...detail.messages);
      if (detail.projectPath !== projectHash) {
        projectPath = detail.projectPath;
      }
    }

    const result: MergedSessionDetail = {
      slug,
      projectPath,
      sessionIds,
      latestSessionId: sessionIds[sessionIds.length - 1],
      messages: allMessages,
      sessionBoundaries,
    };

    res.json(result);
  } catch (err: any) {
    console.error('Error fetching merged session:', err);
    res.status(500).json({ error: 'Failed to fetch merged session' });
  }
});

// DELETE /api/sessions/:projectHash/:sessionId — delete session file and managed entry
router.delete('/:projectHash/:sessionId', (req, res) => {
  try {
    const { projectHash, sessionId } = req.params;
    const sessionFile = path.join(os.homedir(), '.claude', 'projects', projectHash, `${sessionId}.jsonl`);
    if (fs.existsSync(sessionFile)) {
      fs.unlinkSync(sessionFile);
    }
    removeManagedSession(sessionId);
    invalidateSessionCache();
    eventBus.emitSessionEvent({ type: 'session:deleted', sessionId });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('Error deleting session:', err);
    res.status(500).json({ error: err.message || 'Failed to delete session' });
  }
});

// GET /api/sessions/:projectHash/:sessionId
router.get('/:projectHash/:sessionId', (req, res) => {
  try {
    const { projectHash, sessionId } = req.params;
    const detail = parseSession(projectHash, sessionId);
    res.json(detail);
  } catch (err: any) {
    console.error('Error parsing session:', err);
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: 'Session not found' });
    } else {
      res.status(500).json({ error: 'Failed to parse session' });
    }
  }
});

export default router;
