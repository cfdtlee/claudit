import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { Task } from '../types.js';
import { updateTask } from './taskStorage.js';

const WORKTREE_DIR = '.claudit-worktrees';

export async function createWorktree(repoPath: string, taskId: string, branch?: string): Promise<string> {
  const worktreeDir = path.join(repoPath, WORKTREE_DIR);
  const worktreePath = path.join(worktreeDir, taskId);

  if (!fs.existsSync(worktreeDir)) {
    fs.mkdirSync(worktreeDir, { recursive: true });
  }

  try {
    const branchArg = branch ? `-b ${branch}` : `-b task-${taskId.slice(0, 8)}`;
    const actualBranch = branch || `task-${taskId.slice(0, 8)}`;

    execSync(`git worktree add ${branchArg} "${worktreePath}"`, {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: 'pipe',
    });

    updateTask(taskId, {
      worktreeId: taskId,
      branch: actualBranch,
      workingDir: worktreePath,
    });

    console.log(`[worktree] Created worktree for task ${taskId} at ${worktreePath}`);
    return worktreePath;
  } catch (err) {
    console.error(`[worktree] Failed to create worktree:`, err);
    throw err;
  }
}

export async function removeWorktree(repoPath: string, taskId: string): Promise<void> {
  const worktreePath = path.join(repoPath, WORKTREE_DIR, taskId);

  try {
    if (fs.existsSync(worktreePath)) {
      execSync(`git worktree remove "${worktreePath}" --force`, {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      console.log(`[worktree] Removed worktree for task ${taskId}`);
    }
  } catch (err) {
    console.error(`[worktree] Failed to remove worktree:`, err);
    throw err;
  }
}

export async function cleanupOnTaskEnd(task: Task): Promise<void> {
  if (!task.worktreeId || !task.workingDir) return;

  // Determine the repo path from the worktree path
  const worktreeDir = path.dirname(task.workingDir);
  const repoPath = path.dirname(worktreeDir);

  try {
    switch (task.status) {
      case 'done':
        if (task.prUrl) {
          // PR exists, safe to remove
          await removeWorktree(repoPath, task.worktreeId);
        }
        // If no PR, keep the worktree for manual review
        break;
      case 'cancelled':
        await removeWorktree(repoPath, task.worktreeId);
        break;
      case 'failed':
        // Keep for debugging
        console.log(`[worktree] Keeping worktree for failed task ${task.id} for investigation`);
        break;
    }
  } catch (err) {
    console.error(`[worktree] Cleanup failed for task ${task.id}:`, err);
  }
}
