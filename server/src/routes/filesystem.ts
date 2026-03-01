import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

const router = Router();

interface GitInfo {
  branch: string;
  repoName: string;
}

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo?: boolean;
  gitInfo?: GitInfo;
}

/** Get git branch and repo name for a directory */
function getGitInfo(dirPath: string): GitInfo | null {
  try {
    if (!fs.existsSync(path.join(dirPath, '.git'))) return null;
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: dirPath, encoding: 'utf-8', timeout: 3000,
    }).trim();
    // Repo name: top-level directory name of the git repo
    const topLevel = execSync('git rev-parse --show-toplevel', {
      cwd: dirPath, encoding: 'utf-8', timeout: 3000,
    }).trim();
    const repoName = path.basename(topLevel);
    return { branch, repoName };
  } catch {
    return null;
  }
}

// GET /api/filesystem/list?path=...
router.get('/list', (req, res) => {
  try {
    const targetPath = (req.query.path as string) || os.homedir();
    const resolved = path.resolve(targetPath);

    if (!fs.existsSync(resolved)) {
      res.status(400).json({ error: 'Path does not exist' });
      return;
    }
    if (!fs.statSync(resolved).isDirectory()) {
      res.status(400).json({ error: 'Path is not a directory' });
      return;
    }

    const parentPath = path.dirname(resolved) !== resolved ? path.dirname(resolved) : null;

    // Check if current dir is a git repo
    const isGitRepo = fs.existsSync(path.join(resolved, '.git'));
    const gitInfo = isGitRepo ? getGitInfo(resolved) : null;

    const dirents = fs.readdirSync(resolved, { withFileTypes: true });
    const entries: DirectoryEntry[] = [];

    for (const d of dirents) {
      // Skip hidden files and node_modules
      if (d.name.startsWith('.') || d.name === 'node_modules') continue;
      if (!d.isDirectory()) continue;

      const entryPath = path.join(resolved, d.name);
      const entryIsGitRepo = fs.existsSync(path.join(entryPath, '.git'));
      const entryGitInfo = entryIsGitRepo ? getGitInfo(entryPath) : null;

      entries.push({
        name: d.name,
        path: entryPath,
        isDirectory: true,
        isGitRepo: entryIsGitRepo || undefined,
        gitInfo: entryGitInfo || undefined,
      });
    }

    // Sort alphabetically
    entries.sort((a, b) => a.name.localeCompare(b.name));

    res.json({ currentPath: resolved, parentPath, isGitRepo, gitInfo, entries });
  } catch (err: any) {
    console.error('Error listing directory:', err);
    res.status(500).json({ error: err.message || 'Failed to list directory' });
  }
});

// POST /api/filesystem/upload — receive base64 image data, write to temp file
router.post('/upload', (req, res) => {
  try {
    const { data, mimeType } = req.body as { data?: string; mimeType?: string };
    if (!data || !mimeType || !mimeType.startsWith('image/')) {
      res.status(400).json({ error: 'Missing or invalid data/mimeType' });
      return;
    }

    const extMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp',
    };
    const ext = extMap[mimeType] || 'png';

    const uploadDir = path.join(os.homedir(), '.claudit', 'uploads');
    fs.mkdirSync(uploadDir, { recursive: true });

    // Clean up files older than 1 hour
    try {
      const now = Date.now();
      for (const f of fs.readdirSync(uploadDir)) {
        const fp = path.join(uploadDir, f);
        const stat = fs.statSync(fp);
        if (now - stat.mtimeMs > 3600_000) {
          fs.unlinkSync(fp);
        }
      }
    } catch {}

    const filename = `paste-${Date.now()}.${ext}`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));

    res.json({ path: filePath });
  } catch (err: any) {
    console.error('Error uploading file:', err);
    res.status(500).json({ error: err.message || 'Failed to upload file' });
  }
});

export default router;
