#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  getAllTasks,
  getTask,
  getSubtasks,
  createTask,
  updateTask,
  updateTaskStatus,
} from './services/taskStorage.js';
import { getAllAgents, getAgent } from './services/agentStorage.js';
import { getAllMessages, createMessage, markMessageRead, markAllRead, getUnreadCount } from './services/messageStorage.js';
import { getSettingsObject, getSetting, setSetting } from './services/settingsStorage.js';

const server = new McpServer({
  name: 'claudit',
  version: '0.2.0',
});

const SERVER_PORT = parseInt(process.env.PORT || '3001', 10);

/** Call main server's internal API synchronously */
async function serverCall(endpoint: string, body: Record<string, unknown>): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const res = await fetch(`http://localhost:${SERVER_PORT}/api/internal/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: `Server unreachable: ${err.message}` };
  }
}

// Helper to return text content
function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }] };
}

function errorResult(msg: string) {
  return { content: [{ type: 'text' as const, text: msg }], isError: true };
}

// --- get_tasks ---
server.tool(
  'get_tasks',
  'List tasks with optional filters. Returns task id, title, status, assignee, priority, and timestamps.',
  {
    status: z.string().optional().describe('Filter by task status (pending, running, waiting, done, failed, etc.)'),
    assignee: z.string().optional().describe('Filter by agent ID assigned to the task'),
    limit: z.number().optional().describe('Max number of tasks to return (default: 50)'),
  },
  async ({ status, assignee, limit }) => {
    let tasks = getAllTasks({ status: status as any, assignee });
    const maxResults = limit ?? 50;
    tasks = tasks.slice(0, maxResults);

    if (tasks.length === 0) return text('No tasks found.');

    const summary = tasks.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      assignee: t.assignee,
      priority: t.priority,
      parent_id: t.parent_id,
      blocked_by: t.blocked_by,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
    return text(JSON.stringify(summary, null, 2));
  },
);

// --- get_task ---
server.tool(
  'get_task',
  'Get full details of a specific task by ID, including subtasks.',
  {
    taskId: z.string().describe('The task ID'),
  },
  async ({ taskId }) => {
    const task = getTask(taskId);
    if (!task) return errorResult(`Task not found: ${taskId}`);

    const subtasks = getSubtasks(taskId);
    return text(JSON.stringify({ ...task, subtasks }, null, 2));
  },
);

// --- get_agents ---
server.tool(
  'get_agents',
  'List all configured agents with their specialties and system prompts.',
  {},
  async () => {
    const agents = getAllAgents();
    if (agents.length === 0) return text('No agents configured.');

    const summary = agents.map(a => ({
      id: a.id,
      name: a.name,
      specialty: a.specialty,
      systemPrompt: a.systemPrompt?.slice(0, 200),
      lastActiveAt: a.lastActiveAt,
    }));
    return text(JSON.stringify(summary, null, 2));
  },
);

// --- get_messages ---
server.tool(
  'get_messages',
  'Get Mayor messages (events, notifications, witness alerts). Use unreadOnly=true to see only new messages.',
  {
    unreadOnly: z.boolean().optional().describe('If true, only return unread messages'),
  },
  async ({ unreadOnly }) => {
    const messages = getAllMessages({ unreadOnly: unreadOnly ?? false });
    const count = getUnreadCount();

    if (messages.length === 0) return text(`No messages. (${count} unread)`);

    // Auto-mark fetched messages as read
    if (unreadOnly) markAllRead();

    const summary = messages.slice(0, 50).map(m => ({
      id: m.id,
      type: m.type,
      source: m.source,
      subject: m.subject,
      body: m.body.slice(0, 500),
      read: m.read,
      createdAt: m.createdAt,
    }));
    return text(JSON.stringify({ unreadCount: count, messages: summary }, null, 2));
  },
);

// --- get_settings ---
server.tool(
  'get_settings',
  'Get current claudit configuration settings.',
  {},
  async () => {
    const settings = getSettingsObject();
    return text(JSON.stringify(settings, null, 2));
  },
);

// --- create_task ---
server.tool(
  'create_task',
  'Create a new task. For subtasks, set parentId to the parent task ID.',
  {
    title: z.string().describe('Short, actionable title for the task'),
    prompt: z.string().optional().describe('Detailed prompt/instructions for the agent executing this task'),
    parentId: z.string().optional().describe('Parent task ID (for subtasks)'),
    assignee: z.string().optional().describe('Agent ID to assign this task to'),
    blocked_by: z.array(z.string()).optional().describe('Array of task IDs that must complete before this task can start'),
  },
  async ({ title, prompt, parentId, assignee, blocked_by }) => {
    // Validate parent exists if specified
    if (parentId) {
      const parent = getTask(parentId);
      if (!parent) return errorResult(`Parent task not found: ${parentId}`);
    }

    // Validate assignee exists if specified
    if (assignee) {
      const agent = getAgent(assignee);
      if (!agent) return errorResult(`Agent not found: ${assignee}`);
    }

    const task = createTask({
      title,
      prompt,
      status: 'pending',
      created_by: 'mayor',
      order: 0,
      retryCount: 0,
      parent_id: parentId,
      assignee,
      blocked_by,
    });

    return text(`Created task: ${task.id}\n${JSON.stringify(task, null, 2)}`);
  },
);

// --- update_task ---
server.tool(
  'update_task',
  'Update a task\'s status, assignee, or error message. Status transitions are validated.',
  {
    taskId: z.string().describe('The task ID to update'),
    status: z.string().optional().describe('New status (pending, running, waiting, done, failed, cancelled, paused)'),
    assignee: z.string().optional().describe('Agent ID to assign'),
    errorMessage: z.string().optional().describe('Error message (for failed/waiting tasks)'),
    resultSummary: z.string().optional().describe('Result summary (for completed tasks)'),
  },
  async ({ taskId, status, assignee, errorMessage, resultSummary }) => {
    let task;

    // Guard: Mayor cannot set tasks back to pending — only humans can
    if (status === 'pending') {
      return errorResult(`Cannot set task to 'pending' via MCP. Only humans can reset tasks to pending.`);
    }

    if (status) {
      task = updateTaskStatus(taskId, status as any);
      if (!task) {
        const existing = getTask(taskId);
        if (!existing) return errorResult(`Task not found: ${taskId}`);
        return errorResult(`Invalid status transition: ${existing.status} → ${status}`);
      }
    }

    const updates: Record<string, unknown> = {};
    if (assignee !== undefined) updates.assignee = assignee;
    if (errorMessage !== undefined) updates.errorMessage = errorMessage;
    if (resultSummary !== undefined) updates.resultSummary = resultSummary;

    if (Object.keys(updates).length > 0) {
      task = updateTask(taskId, updates);
      if (!task) return errorResult(`Task not found: ${taskId}`);
    }

    if (!task) {
      task = getTask(taskId);
      if (!task) return errorResult(`Task not found: ${taskId}`);
    }

    return text(`Updated task: ${task.id}\n${JSON.stringify(task, null, 2)}`);
  },
);

// --- assign_task ---
server.tool(
  'assign_task',
  'Assign a task to a specific agent. Validates that both the task and agent exist.',
  {
    taskId: z.string().describe('The task ID'),
    agentId: z.string().describe('The agent ID to assign'),
  },
  async ({ taskId, agentId }) => {
    const task = getTask(taskId);
    if (!task) return errorResult(`Task not found: ${taskId}`);

    const agent = getAgent(agentId);
    if (!agent) return errorResult(`Agent not found: ${agentId}`);

    const updated = updateTask(taskId, { assignee: agentId });
    return text(`Assigned task "${task.title}" to agent "${agent.name}"\n${JSON.stringify(updated, null, 2)}`);
  },
);

// --- spawn_session ---
server.tool(
  'spawn_session',
  'Spawn a new Claude Code agent session to work on a task. The agent will receive the task prompt and begin working.',
  {
    taskId: z.string().describe('The task ID to work on'),
    agentId: z.string().describe('The agent ID to use'),
  },
  async ({ taskId, agentId }) => {
    const task = getTask(taskId);
    if (!task) return errorResult(`Task not found: ${taskId}`);
    if (task.status !== 'pending') {
      return errorResult(`Task "${task.title}" has status '${task.status}' — only 'pending' tasks can be spawned. Do NOT retry.`);
    }

    const agent = getAgent(agentId);
    if (!agent) return errorResult(`Agent not found: ${agentId}`);

    const res = await serverCall('spawn', { taskId, agentId });
    if (!res.ok) return errorResult(`Spawn failed: ${res.error}`);

    return text(`Spawned session ${res.data.sessionId} for task "${task.title}" with agent "${agent.name}".`);
  },
);

// --- kill_session ---
server.tool(
  'kill_session',
  'Stop a running agent session.',
  {
    sessionId: z.string().describe('The Claude session ID to stop'),
  },
  async ({ sessionId }) => {
    const res = await serverCall('kill', { sessionId });
    if (!res.ok) return errorResult(`Kill failed: ${res.error}`);
    return text(res.data.ok ? `Session ${sessionId} stopped.` : `Session ${sessionId} not found or already stopped.`);
  },
);

// --- send_to_agent ---
server.tool(
  'send_to_agent',
  'Send a message to a running agent session.',
  {
    agentId: z.string().describe('The agent ID to send the message to'),
    message: z.string().describe('The message content to send'),
  },
  async ({ agentId, message }) => {
    const res = await serverCall('send', { agentId, message });
    if (!res.ok) return errorResult(`Send failed: ${res.error}`);
    return text(res.data.ok ? `Message sent to agent ${agentId}.` : `Agent ${agentId} has no active session.`);
  },
);

// --- notify_human ---
server.tool(
  'notify_human',
  'Send a notification message to the human operator. Shows up in the claudit dashboard.',
  {
    message: z.string().describe('The notification message for the human'),
  },
  async ({ message }) => {
    const msg = createMessage({
      type: 'notification',
      source: 'mayor',
      subject: 'Mayor notification',
      body: message,
    });
    return text(`Notification sent: ${msg.id}`);
  },
);

// --- sleep ---
server.tool(
  'sleep',
  'Wait for a specified duration (useful for polling agent completion). Max 300 seconds.',
  {
    seconds: z.number().describe('Number of seconds to sleep (max 300)'),
  },
  async ({ seconds }) => {
    const duration = Math.min(Math.max(1, seconds), 300);
    await new Promise(resolve => setTimeout(resolve, duration * 1000));
    return text(`Slept for ${duration} seconds.`);
  },
);

// --- handoff ---
server.tool(
  'handoff',
  'Save a context summary before your session ends. The server will re-invoke Mayor with this summary.',
  {
    summary: z.string().describe('Summary of current state and pending actions for the next Mayor invocation'),
  },
  async ({ summary }) => {
    setSetting('mayorHandoffSummary', summary);
    return text('Handoff summary saved. Mayor will be re-invoked with this context.');
  },
);

// --- Start server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('MCP server error:', err);
  process.exit(1);
});
