import { EventEmitter } from 'events';
import { getSettingsObject, getSetting } from './settingsStorage.js';
import { getAllTasks, updateTask } from './taskStorage.js';
import { createMessage } from './messageStorage.js';

export const witnessEmitter = new EventEmitter();

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let lastCheckTime = '';
let running = false;

export function isWitnessRunning(): boolean {
  return running;
}

export function getWitnessLastCheck(): string {
  return lastCheckTime;
}

function runCheck() {
  try {
    lastCheckTime = new Date().toISOString();
    const config = getSettingsObject();

    // 1. Always emit mayorCheck — let the handler decide whether to act
    const mayorSessionId = getSetting('mayorSessionId');
    witnessEmitter.emit('mayorCheck', mayorSessionId ?? '');

    // 2. Check all running tasks for stuck sessions
    const allTasks = getAllTasks();
    const timeoutMs = config.sessionTimeoutMs ?? 600000;

    for (const task of allTasks) {
      if (task.status === 'running' && task.startedAt) {
        const elapsed = Date.now() - new Date(task.startedAt).getTime();
        if (elapsed > timeoutMs) {
          // Create a witness message for Mayor to read
          createMessage({
            type: 'witness',
            source: 'witness',
            subject: `Session stuck: ${task.title}`,
            body: `Task "${task.title}" (${task.id}) has been running for ${Math.round(elapsed / 60000)} minutes (timeout: ${Math.round(timeoutMs / 60000)}m). Consider killing the session or extending the timeout.`,
          });

          witnessEmitter.emit('sessionStuck', {
            taskId: task.id,
            elapsed,
            timeoutMs,
          });
        }
      }
    }

    // 3. Unblock tasks whose dependencies are all done
    for (const task of allTasks) {
      if (task.status !== 'pending' || !task.blocked_by || task.blocked_by.length === 0) continue;

      const allDone = task.blocked_by.every(depId => {
        const dep = allTasks.find(t => t.id === depId);
        return dep?.status === 'done';
      });

      if (allDone) {
        try {
          updateTask(task.id, { blocked_by: [] });

          // Create an event message for Mayor to read
          createMessage({
            type: 'event',
            source: 'witness',
            subject: `Task unblocked: ${task.title}`,
            body: `Task "${task.title}" (${task.id}) is now unblocked — all dependencies are done. It can be scheduled for execution.`,
          });

          witnessEmitter.emit('taskUnblocked', task.id);
        } catch (err) {
          console.error(`[witness] Failed to unblock task ${task.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error('[witness] Check failed:', err);
  }
}

export function startWitness(): void {
  if (running) return;
  running = true;

  const config = getSettingsObject();
  const intervalMs = config.witnessIntervalMs ?? 30000;

  console.log(`[witness] Starting with interval ${intervalMs}ms`);
  // Defer first check so it doesn't block server startup
  setTimeout(runCheck, 1000);
  intervalHandle = setInterval(runCheck, intervalMs);
}

export function stopWitness(): void {
  if (!running) return;
  running = false;

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  console.log('[witness] Stopped');
}
