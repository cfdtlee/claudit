import { query, type Query, type SDKMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import fs from 'fs';
import os from 'os';

/**
 * Agent Chat Service — replaces ClaudeProcess for WebSocket chat mode.
 *
 * Uses the Claude Agent SDK v1 `query()` API with streaming async input
 * so we can send follow-up messages within a single long-lived query.
 */

interface AgentSession {
  sessionId: string;
  projectPath: string;
  queryInstance: Query | null;
  /** Resolve the next user message into the prompt stream */
  resolveNext: ((msg: SDKUserMessage) => void) | null;
  /** Set to true once a user message has been sent */
  userMessageSent: boolean;
  /** Abort controller for cleanup */
  abortController: AbortController;
  /** Whether the session is being torn down */
  closing: boolean;
}

const activeSessions = new Map<string, AgentSession>();

type EventCallback = (sessionId: string, event: SDKMessage) => void;
const eventCallbacks = new Map<string, EventCallback>();

/**
 * Create an async generator that yields user messages on demand.
 * Each call to resolveNext() pushes a message into the stream.
 */
function createMessageChannel() {
  let resolveNext: ((msg: SDKUserMessage) => void) | null = null;
  let closed = false;

  const stream: AsyncIterable<SDKUserMessage> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<SDKUserMessage>> {
          if (closed) {
            return Promise.resolve({ done: true, value: undefined });
          }
          return new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
            resolveNext = (msg: SDKUserMessage) => {
              resolveNext = null;
              resolve({ done: false, value: msg });
            };
          });
        },
        return(): Promise<IteratorResult<SDKUserMessage>> {
          closed = true;
          resolveNext = null;
          return Promise.resolve({ done: true, value: undefined });
        },
      };
    },
  };

  return {
    stream,
    send(msg: SDKUserMessage) {
      resolveNext?.(msg);
    },
    getResolveNext() {
      return resolveNext;
    },
    close() {
      closed = true;
      // Resolve any pending wait so the generator exits
      resolveNext?.({ type: 'user', message: { role: 'user', content: '' }, parent_tool_use_id: null } as SDKUserMessage);
      resolveNext = null;
    },
  };
}

/**
 * Start a new agent chat session backed by the SDK.
 */
export function startSession(
  sessionId: string,
  projectPath: string,
  onEvent: EventCallback,
): void {
  // Clean up any existing session
  stopSession(sessionId);

  const cwd = fs.existsSync(projectPath) ? projectPath : os.homedir();
  const abortController = new AbortController();
  const channel = createMessageChannel();

  const session: AgentSession = {
    sessionId,
    projectPath: cwd,
    queryInstance: null,
    resolveNext: null,
    userMessageSent: false,
    abortController,
    closing: false,
  };

  activeSessions.set(sessionId, session);
  eventCallbacks.set(sessionId, onEvent);

  console.log(`[agentChat] Starting session ${sessionId} cwd=${cwd}`);

  // Start the query with the async message stream as prompt
  const q = query({
    prompt: channel.stream,
    options: {
      resume: sessionId,
      cwd,
      includePartialMessages: true,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      abortController,
    },
  });

  session.queryInstance = q;

  // Store the channel send function so sendMessage can use it
  session.resolveNext = null;
  // We need a way to push messages — store the channel on the session
  (session as any)._channel = channel;

  // Consume the async generator in the background
  (async () => {
    try {
      for await (const event of q) {
        if (session.closing) break;

        const cb = eventCallbacks.get(sessionId);
        if (cb) {
          cb(sessionId, event);
        }
      }
    } catch (err: any) {
      if (session.closing) return; // Expected during teardown
      console.error(`[agentChat] Stream error for ${sessionId}: ${err.message}`);
      const cb = eventCallbacks.get(sessionId);
      if (cb) {
        // Emit a synthetic error event
        cb(sessionId, {
          type: 'result',
          subtype: 'error',
          error: err.message || 'Unknown error',
          uuid: crypto.randomUUID() as any,
          session_id: sessionId,
        } as any);
      }
    } finally {
      console.log(`[agentChat] Stream ended for ${sessionId}`);
      // Clean up if not already done
      if (activeSessions.has(sessionId) && !session.closing) {
        activeSessions.delete(sessionId);
        eventCallbacks.delete(sessionId);
      }
    }
  })();
}

/**
 * Send a user message to an active session.
 */
export function sendMessage(sessionId: string, content: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) {
    console.warn(`[agentChat] No active session for ${sessionId}`);
    return false;
  }

  const channel = (session as any)._channel as ReturnType<typeof createMessageChannel>;
  if (!channel) {
    console.warn(`[agentChat] No message channel for ${sessionId}`);
    return false;
  }

  session.userMessageSent = true;

  const msg: SDKUserMessage = {
    type: 'user',
    message: { role: 'user', content },
    parent_tool_use_id: null,
  };

  console.log(`[agentChat] Sending message to ${sessionId}: ${content.slice(0, 100)}`);
  channel.send(msg);
  return true;
}

/**
 * Stop an active session and release resources.
 */
export function stopSession(sessionId: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) return;

  console.log(`[agentChat] Stopping session ${sessionId}`);
  session.closing = true;

  // Close the message channel
  const channel = (session as any)._channel as ReturnType<typeof createMessageChannel> | undefined;
  channel?.close();

  // Close the query (kills the subprocess)
  try {
    session.queryInstance?.close();
  } catch {
    // Already closed
  }

  // Abort any pending operations
  try {
    session.abortController.abort();
  } catch {
    // Already aborted
  }

  activeSessions.delete(sessionId);
  eventCallbacks.delete(sessionId);
}

/**
 * Check if a session is currently active.
 */
export function getActiveSession(sessionId: string): boolean {
  return activeSessions.has(sessionId);
}

/**
 * Stop all active sessions (for graceful shutdown).
 */
export function stopAllChatSessions(): void {
  for (const sessionId of [...activeSessions.keys()]) {
    stopSession(sessionId);
  }
}
