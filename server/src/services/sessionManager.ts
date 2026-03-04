import os from 'os';
import { spawn } from 'child_process';
import { ClaudeProcess, CLAUDE_BIN } from './claudeProcess.js';
import { CompletionDetector } from './completionDetector.js';
import { getTask, updateTask, updateTaskStatus } from './taskStorage.js';
import { getAgent } from './agentStorage.js';
import { createTaskSession, updateTaskSession } from './taskSessionStorage.js';
import { createMessage } from './messageStorage.js';
import { eventBus } from './eventBus.js';
import { getMcpConfigPath } from './mayorService.js';

interface AgentSession {
  taskId: string;
  agentId: string;
  sessionId: string;
  process: ClaudeProcess;
  detector: CompletionDetector;
  taskSessionId: string;
}

const activeSessions = new Map<string, AgentSession>();

/**
 * Create a new Claude session via `claude -p` and return the session_id.
 */
function createAgentClaudeSession(agentSystemPrompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([k]) => k !== 'CLAUDECODE'),
    );

    const mcpConfigPath = getMcpConfigPath();
    const args = ['-p', '--output-format', 'json', '--dangerously-skip-permissions'];
    if (mcpConfigPath) {
      args.push('--mcp-config', mcpConfigPath);
    }

    const proc = spawn(CLAUDE_BIN, args, {
      cwd: os.homedir(),
      env: cleanEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('createAgentClaudeSession timed out after 120s'));
    }, 120000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const output = stdout || stderr;
      const lines = output.trim().split('\n');
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.session_id) {
            return resolve(parsed.session_id);
          }
        } catch { /* skip non-JSON lines */ }
      }
      reject(new Error(`Failed to get session_id (exit=${code}): ${output.slice(0, 200)}`));
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    // Send agent's system prompt as the first message to establish context
    proc.stdin.write(agentSystemPrompt || 'You are a coding agent. Acknowledge with READY.');
    proc.stdin.end();
  });
}

export async function spawnAgentSession(taskId: string, agentId: string): Promise<{ sessionId: string }> {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  // Guard: only allow spawning for pending tasks
  if (task.status !== 'pending') {
    throw new Error(`Task ${taskId} has status '${task.status}' — only 'pending' tasks can be spawned`);
  }

  // Guard: reject if task already has an active session
  const existing = [...activeSessions.values()].find(s => s.taskId === taskId);
  if (existing) {
    throw new Error(`Task ${taskId} already has active session: ${existing.sessionId}`);
  }

  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Agent not found: ${agentId}`);

  // Create a new Claude session
  const claudeSessionId = await createAgentClaudeSession(agent.systemPrompt);
  console.log(`[sessionManager] Created Claude session ${claudeSessionId} for task ${taskId} agent ${agentId}`);

  // Create a TaskSession record
  const taskSession = createTaskSession({
    taskId,
    sessionId: claudeSessionId,
    agentId,
    startedAt: new Date().toISOString(),
  });

  // Update task to running and bind session
  updateTask(taskId, { status: 'running', assignee: agentId, sessionId: claudeSessionId, startedAt: new Date().toISOString() });

  // Build the ClaudeProcess for the session
  const mcpConfigPath = getMcpConfigPath();
  const extraArgs = mcpConfigPath ? ['--mcp-config', mcpConfigPath] : [];
  const claudeProcess = new ClaudeProcess(claudeSessionId, task.workingDir || os.homedir(), extraArgs);

  // Set up completion detector
  const detector = new CompletionDetector(claudeProcess, taskId, taskSession.id);

  const session: AgentSession = {
    taskId,
    agentId,
    sessionId: claudeSessionId,
    process: claudeProcess,
    detector,
    taskSessionId: taskSession.id,
  };

  activeSessions.set(claudeSessionId, session);

  // Wire completion/failure handlers
  detector.on('taskComplete', (summary: string) => {
    console.log(`[sessionManager] Task ${taskId} completed: ${summary}`);
    activeSessions.delete(claudeSessionId);
    updateTaskSession(taskSession.id, { endedAt: new Date().toISOString(), resultSummary: summary });

    createMessage({
      type: 'event',
      source: 'sessionManager',
      subject: `Task completed: ${task.title}`,
      body: `Agent "${agent.name}" completed task "${task.title}". Summary: ${summary}`,
    });

    eventBus.emitEvent({ type: 'task:updated', taskId });
    eventBus.emitEvent({ type: 'agent:session_stopped', sessionId: claudeSessionId, agentId, taskId });
    eventBus.emitEvent({ type: 'notification', level: 'success', title: 'Task completed', message: `"${task.title}"` });
  });

  detector.on('taskFailed', (reason: string) => {
    console.log(`[sessionManager] Task ${taskId} failed: ${reason}`);
    activeSessions.delete(claudeSessionId);
    updateTaskSession(taskSession.id, { endedAt: new Date().toISOString() });

    createMessage({
      type: 'event',
      source: 'sessionManager',
      subject: `Task failed: ${task.title}`,
      body: `Agent "${agent.name}" failed task "${task.title}". Reason: ${reason}`,
    });

    eventBus.emitEvent({ type: 'task:updated', taskId });
    eventBus.emitEvent({ type: 'agent:session_stopped', sessionId: claudeSessionId, agentId, taskId });
    eventBus.emitEvent({ type: 'notification', level: 'error', title: 'Task failed', message: `"${task.title}" — ${reason}`, duration: 15000 });
  });

  // Handle process done without explicit completion signal
  claudeProcess.on('done', () => {
    if (activeSessions.has(claudeSessionId)) {
      console.log(`[sessionManager] Process done for session ${claudeSessionId} (no explicit completion signal)`);
      activeSessions.delete(claudeSessionId);
      updateTaskSession(taskSession.id, { endedAt: new Date().toISOString() });
      // Don't auto-mark task as done — it may need re-running
      eventBus.emitEvent({ type: 'agent:session_stopped', sessionId: claudeSessionId, agentId, taskId });
    }
  });

  // Start the process and detector
  detector.start();
  claudeProcess.start();

  // Send the task prompt to the agent
  const taskPrompt = task.prompt || task.title;
  claudeProcess.sendMessage(taskPrompt);

  eventBus.emitEvent({ type: 'task:updated', taskId });
  eventBus.emitEvent({ type: 'agent:session_started', sessionId: claudeSessionId, agentId, taskId });

  return { sessionId: claudeSessionId };
}

export function killAgentSession(sessionId: string): boolean {
  const session = activeSessions.get(sessionId);
  if (!session) return false;

  session.detector.stop();
  session.process.stop();
  activeSessions.delete(sessionId);

  updateTaskSession(session.taskSessionId, { endedAt: new Date().toISOString() });
  updateTask(session.taskId, { status: 'paused' });

  eventBus.emitEvent({ type: 'task:updated', taskId: session.taskId });
  eventBus.emitEvent({ type: 'agent:session_stopped', sessionId, agentId: session.agentId, taskId: session.taskId });

  return true;
}

export function sendToAgent(agentId: string, message: string): boolean {
  for (const session of activeSessions.values()) {
    if (session.agentId === agentId) {
      session.process.sendMessage(message);
      return true;
    }
  }
  return false;
}

export function getActiveSessions(): AgentSession[] {
  return Array.from(activeSessions.values());
}

export function stopAllAgentSessions(): void {
  for (const [sessionId, session] of activeSessions) {
    console.log(`[sessionManager] Stopping session ${sessionId}`);
    session.detector.stop();
    session.process.stop();
    updateTaskSession(session.taskSessionId, { endedAt: new Date().toISOString() });
  }
  activeSessions.clear();
}
