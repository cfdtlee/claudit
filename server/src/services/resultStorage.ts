import path from 'path';
import os from 'os';
import fs from 'fs';
import { Checkpoint } from '../types.js';

const RESULTS_DIR = path.join(os.homedir(), '.claudit', 'results');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function saveSessionResult(taskId: string, sessionId: string, content: string): string {
  const dir = path.join(RESULTS_DIR, taskId);
  ensureDir(dir);
  const filePath = path.join(dir, `session-${sessionId}.md`);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function saveCheckpoints(taskId: string, checkpoints: Checkpoint[]): void {
  const dir = path.join(RESULTS_DIR, taskId);
  ensureDir(dir);
  const lines = checkpoints.map(
    (c, i) => `## Checkpoint ${i + 1}: ${c.step}\n\n**Time:** ${c.timestamp}\n${c.output ? `\n${c.output}\n` : ''}`
  );
  fs.writeFileSync(path.join(dir, 'checkpoints.md'), lines.join('\n---\n\n'), 'utf-8');
}

export function cleanupTaskResults(taskId: string): void {
  const dir = path.join(RESULTS_DIR, taskId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function getResultContent(resultPath: string): string | null {
  try {
    if (fs.existsSync(resultPath)) {
      return fs.readFileSync(resultPath, 'utf-8');
    }
  } catch (err) {
    console.error('[resultStorage] Error reading result:', err);
  }
  return null;
}
