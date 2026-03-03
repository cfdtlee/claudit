import { EventEmitter } from 'events';
import { ClaudeProcess } from './claudeProcess.js';
import { updateTask } from './taskStorage.js';
import { appendCheckpoint, updateTaskSession } from './taskSessionStorage.js';

export class CompletionDetector extends EventEmitter {
  private claudeProcess: ClaudeProcess;
  private textBuffer = '';
  private listening = false;
  private taskId: string;
  private taskSessionId: string;

  constructor(claudeProcess: ClaudeProcess, taskId: string, taskSessionId: string) {
    super();
    this.claudeProcess = claudeProcess;
    this.taskId = taskId;
    this.taskSessionId = taskSessionId;
  }

  start(): void {
    if (this.listening) return;
    this.listening = true;

    this.claudeProcess.on('assistant_text', this.handleText);
    this.claudeProcess.on('done', this.handleDone);
  }

  stop(): void {
    if (!this.listening) return;
    this.listening = false;

    this.claudeProcess.off('assistant_text', this.handleText);
    this.claudeProcess.off('done', this.handleDone);
  }

  private handleText = (text: string) => {
    this.textBuffer += text;
    this.scanBuffer();
  };

  private handleDone = () => {
    // Final scan of remaining buffer
    this.scanBuffer();
    this.textBuffer = '';
  };

  private scanBuffer() {
    const lines = this.textBuffer.split('\n');
    // Keep last incomplete line in buffer
    this.textBuffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('TASK_COMPLETE:')) {
        const summary = trimmed.slice('TASK_COMPLETE:'.length).trim();
        this.handleTaskComplete(summary);
      } else if (trimmed.startsWith('TASK_FAILED:')) {
        const reason = trimmed.slice('TASK_FAILED:'.length).trim();
        this.handleTaskFailed(reason);
      } else if (trimmed.startsWith('CHECKPOINT:')) {
        const description = trimmed.slice('CHECKPOINT:'.length).trim();
        this.handleCheckpoint(description);
      } else if (trimmed === 'WAITING_FOR_INPUT') {
        this.handleWaitingForInput();
      }
    }
  }

  private handleTaskComplete(summary: string) {
    try {
      updateTaskSession(this.taskSessionId, { resultSummary: summary });
      updateTask(this.taskId, {
        status: 'done',
        resultSummary: summary,
        completedAt: new Date().toISOString(),
      });
      this.emit('taskComplete', summary);
    } catch (err) {
      console.error('[completionDetector] Error handling task complete:', err);
    }
  }

  private handleTaskFailed(reason: string) {
    try {
      updateTask(this.taskId, {
        status: 'failed',
        errorMessage: reason,
        completedAt: new Date().toISOString(),
      });
      this.emit('taskFailed', reason);
    } catch (err) {
      console.error('[completionDetector] Error handling task failed:', err);
    }
  }

  private handleCheckpoint(description: string) {
    try {
      const checkpoint = {
        step: description,
        timestamp: new Date().toISOString(),
      };
      appendCheckpoint(this.taskSessionId, checkpoint);
      this.emit('checkpoint', description);
    } catch (err) {
      console.error('[completionDetector] Error handling checkpoint:', err);
    }
  }

  private handleWaitingForInput() {
    try {
      updateTask(this.taskId, { status: 'waiting' });
      this.emit('waitingForInput');
    } catch (err) {
      console.error('[completionDetector] Error handling waiting for input:', err);
    }
  }
}
