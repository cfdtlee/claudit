import { spawn, ChildProcess, execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import { EventEmitter } from 'events';

// Resolve claude binary path at startup so spawn can find it
export const CLAUDE_BIN = (() => {
  try {
    return execSync('which claude', { encoding: 'utf-8' }).trim();
  } catch {
    return 'claude'; // fallback
  }
})();
console.log(`[claude] Binary path: ${CLAUDE_BIN}`);

export class ClaudeProcess extends EventEmitter {
  private proc: ChildProcess | null = null;
  private sessionId: string;
  private projectPath: string;
  private extraArgs: string[];
  private stdoutBuffer = '';
  private stderrBuffer = '';
  private lastTextLength = 0;
  private lastThinkingLength = 0;
  private lastMessageId = '';
  private sentToolUseIds = new Set<string>();
  private userMessageSent = false;
  private resumeReady = false;
  private pendingMessage: string | null = null;

  constructor(sessionId: string, projectPath: string, extraArgs?: string[]) {
    super();
    this.sessionId = sessionId;
    this.projectPath = projectPath;
    this.extraArgs = extraArgs ?? [];
  }

  private resetTracking() {
    this.lastTextLength = 0;
    this.lastThinkingLength = 0;
    this.lastMessageId = '';
    this.sentToolUseIds.clear();
    this.stdoutBuffer = '';
    this.stderrBuffer = '';
    this.resumeReady = false;
  }

  private _spawnProcess(onClose: (code: number | null) => void): ChildProcess {
    const cwd = fs.existsSync(this.projectPath) ? this.projectPath : os.homedir();
    console.log(`[claude] Spawning CLI: resume=${this.sessionId} cwd=${cwd}`);

    const proc = spawn(CLAUDE_BIN, [
      '--resume', this.sessionId,
      '-p',
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      ...this.extraArgs,
    ], {
      cwd,
      env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE')),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data: Buffer) => {
      this.processStreamData(data, 'stdout');
    });

    proc.stderr?.on('data', (data: Buffer) => {
      this.processStreamData(data, 'stderr');
    });

    proc.on('close', onClose);

    proc.on('error', (err) => {
      console.error(`[claude] Process error: ${err.message}`);
      this.emit('error', err.message);
      this.proc = null;
    });

    return proc;
  }

  start() {
    this.proc = this._spawnProcess((code) => {
      console.log(`[claude] Process exited with code ${code}`);
      this.proc = null;

      if (this.userMessageSent) {
        this.emit('done');
        this.emit('process_exit', code);
      } else if (this.pendingMessage) {
        console.log('[claude] Process exited during resume, restarting for pending message...');
        const msg = this.pendingMessage;
        this.pendingMessage = null;
        this.restart(msg);
      } else {
        console.log('[claude] Process exited during resume (no pending message)');
      }
    });
  }

  /** Restart the process and send a message once ready */
  private restart(content: string) {
    // Kill old process before spawning new one
    if (this.proc) {
      try { this.proc.kill('SIGKILL'); } catch { /* already dead */ }
      this.proc = null;
    }

    this.userMessageSent = true;
    this.resetTracking();

    this.proc = this._spawnProcess((code) => {
      console.log(`[claude] Restarted process exited with code ${code}`);
      this.emit('done');
      this.emit('process_exit', code);
      this.proc = null;
    });

    // Write the user message to stdin
    const msg = JSON.stringify({
      type: 'user',
      message: { role: 'user', content },
    }) + '\n';
    console.log(`[claude] Sending to restarted stdin: ${msg.trim().slice(0, 200)}`);
    this.proc.stdin?.write(msg);
  }

  private processStreamData(data: Buffer, source: 'stdout' | 'stderr') {
    const bufferKey = source === 'stdout' ? 'stdoutBuffer' : 'stderrBuffer';
    this[bufferKey] += data.toString();
    const lines = this[bufferKey].split('\n');
    this[bufferKey] = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        this.handleStreamEvent(parsed);
      } catch {
        if (source === 'stderr') {
          const text = line.trim();
          if (text.includes('Error') || text.includes('error')) {
            console.error(`[claude] stderr text: ${text.slice(0, 300)}`);
            this.emit('error', text);
          }
        }
      }
    }
  }

  private handleStreamEvent(event: any) {
    switch (event.type) {
      case 'system':
        this.emit('ready');
        break;

      case 'assistant': {
        if (!this.userMessageSent) break;

        const msg = event.message;
        if (!msg?.content) break;

        const messageId = msg.id || '';

        if (messageId !== this.lastMessageId) {
          this.lastMessageId = messageId;
          this.lastTextLength = 0;
          this.lastThinkingLength = 0;
        }

        let fullText = '';
        let fullThinking = '';

        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            fullText += block.text;
          } else if (block.type === 'thinking' && block.thinking) {
            fullThinking += block.thinking;
          } else if (block.type === 'tool_use' && !this.sentToolUseIds.has(block.id)) {
            this.sentToolUseIds.add(block.id);
            this.emit('tool_use', {
              name: block.name,
              id: block.id,
              input: block.input || {},
            });
          }
        }

        if (fullThinking.length > this.lastThinkingLength) {
          const delta = fullThinking.slice(this.lastThinkingLength);
          this.lastThinkingLength = fullThinking.length;
          this.emit('assistant_thinking', delta);
        }

        if (fullText.length > this.lastTextLength) {
          const delta = fullText.slice(this.lastTextLength);
          this.lastTextLength = fullText.length;
          this.emit('assistant_text', delta);
        }
        break;
      }

      case 'result':
        if (!this.userMessageSent) {
          console.log('[claude] Resume replay complete, CLI ready for input');
          this.resumeReady = true;

          // Flush any queued message now that resume is done
          if (this.pendingMessage) {
            const pending = this.pendingMessage;
            this.pendingMessage = null;
            console.log(`[claude] Flushing pending message: ${pending.slice(0, 100)}`);
            this._doSendMessage(pending);
          }
          break;
        }
        if (event.result && typeof event.result === 'string' && this.lastTextLength === 0) {
          this.emit('assistant_text', event.result);
        }
        console.log(`[claude] Result: subtype=${event.subtype} result=${String(event.result).slice(0, 100)}`);
        this.emit('done');
        break;

      case 'user':
        break;

      default:
        break;
    }
  }

  sendMessage(content: string) {
    if (!this.proc?.stdin?.writable) {
      console.log('[claude] Process not running, restarting for message...');
      this.restart(content);
      return;
    }

    // If CLI is still resuming (no result yet), queue message for later
    if (!this.userMessageSent && !this.resumeReady) {
      console.log(`[claude] CLI still resuming, queuing message: ${content.slice(0, 100)}`);
      this.pendingMessage = content;
      return;
    }

    this._doSendMessage(content);
  }

  private _doSendMessage(content: string) {
    if (!this.proc?.stdin?.writable) {
      console.log('[claude] Process not running, restarting for message...');
      this.restart(content);
      return;
    }

    this.userMessageSent = true;
    this.resumeReady = false;
    this.lastTextLength = 0;
    this.lastThinkingLength = 0;
    this.lastMessageId = '';
    this.sentToolUseIds.clear();

    const msg = JSON.stringify({
      type: 'user',
      message: { role: 'user', content },
    }) + '\n';
    console.log(`[claude] Sending to stdin: ${msg.trim().slice(0, 200)}`);
    this.proc.stdin.write(msg);
  }

  isAlive(): boolean {
    return this.proc !== null && this.proc.exitCode === null && !this.proc.killed;
  }

  stop() {
    if (this.proc) {
      console.log(`[claude] Stopping process pid=${this.proc.pid}`);
      const p = this.proc;
      this.proc = null; // Clear reference immediately to prevent reuse
      try { p.kill('SIGTERM'); } catch { /* already dead */ }
      setTimeout(() => {
        try { p.kill('SIGKILL'); } catch { /* already dead */ }
      }, 3000);
    }
  }
}
