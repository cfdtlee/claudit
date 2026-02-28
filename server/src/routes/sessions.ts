import { Router } from 'express';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CLAUDE_BIN = (() => {
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    return 'claude';
  }
})();
import { getSessionIndex, invalidateSessionCache } from '../services/historyIndex.js';
import { parseSession } from '../services/sessionParser.js';
import { addManagedSession, renameManagedSession, archiveManagedSession, removeManagedSession, pinManagedSession } from '../services/managedSessions.js';
import { eventBus } from '../services/eventBus.js';

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
router.post('/new', (req, res) => {
  try {
    const { projectPath, worktree, displayName, initialPrompt } = req.body;
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

    // Run claude with the initial prompt to create a session
    const prompt = (typeof initialPrompt === 'string' && initialPrompt.trim())
      ? initialPrompt.trim()
      : 'hello';
    const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE'));
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    let result: string;
    try {
      result = execSync(
        `${CLAUDE_BIN} -p --output-format json --max-turns 1 '${escapedPrompt}'`,
        { cwd: actualProjectPath, encoding: 'utf-8', timeout: 60_000, env: cleanEnv },
      );
    } catch (e: any) {
      console.error(`[session] Claude CLI failed:`, e.stderr || e.stdout || e.message);
      res.status(500).json({ error: `Failed to create session: ${e.stderr || e.message}` });
      return;
    }

    // Parse the JSON result to get the session ID
    const parsed = JSON.parse(result);
    const sessionId = parsed.session_id;
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
