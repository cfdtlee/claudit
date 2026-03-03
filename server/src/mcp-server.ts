#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  getAllTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
} from './services/taskStorage.js';

const server = new McpServer({
  name: 'claudit',
  version: '0.1.0',
});

const PRIORITY_LABELS: Record<number, string> = { 1: 'low', 2: 'medium', 3: 'high' };
const PRIORITY_MAP: Record<string, number> = { low: 1, medium: 2, high: 3 };

// --- list_todos ---
server.tool(
  'list_todos',
  'List all todos. Optionally filter by status (pending/completed) and priority (low/medium/high).',
  {
    status: z.enum(['pending', 'completed', 'all']).optional().describe('Filter by completion status. Default: all'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('Filter by priority level'),
    groupId: z.string().optional().describe('Filter by group ID. Pass "ungrouped" to get only todos that are not assigned to any group.'),
  },
  async ({ status, priority, groupId }) => {
    let tasks = getAllTasks();
    if (status === 'pending') tasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
    else if (status === 'completed') tasks = tasks.filter(t => t.status === 'done');
    if (priority) tasks = tasks.filter(t => t.priority === PRIORITY_MAP[priority]);
    if (groupId === 'ungrouped') tasks = tasks.filter(t => !t.groupId);
    else if (groupId) tasks = tasks.filter(t => t.groupId === groupId);

    const summary = tasks.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      completed: t.status === 'done',
      priority: PRIORITY_LABELS[t.priority ?? 2] ?? 'medium',
      groupId: t.groupId,
      position: t.order,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      sessionId: t.sessionId,
    }));

    return {
      content: [{
        type: 'text' as const,
        text: tasks.length === 0
          ? 'No todos found.'
          : JSON.stringify(summary, null, 2),
      }],
    };
  },
);

// --- get_todo ---
server.tool(
  'get_todo',
  'Get full details of a specific todo by ID, including title, description, priority, completion status, linked session, and timestamps.',
  {
    id: z.string().describe('The todo ID (UUID format, obtained from list_todos)'),
  },
  async ({ id }) => {
    const task = getTask(id);
    if (!task) {
      return {
        content: [{ type: 'text' as const, text: `Todo not found: ${id}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(task, null, 2) }],
    };
  },
);

// --- create_todo ---
server.tool(
  'create_todo',
  'Create a new todo item. Use this when the user asks to add a task, reminder, or action item. Returns the created todo with its generated ID.',
  {
    title: z.string().describe('Short, actionable title (e.g. "Fix login bug", "Review PR #42")'),
    description: z.string().optional().describe('Longer details, context, or acceptance criteria for the todo'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('Priority level: "high" for urgent/blocking items, "low" for nice-to-haves. Default: medium'),
    sessionId: z.string().optional().describe('Claude Code session ID to link this todo to (for tracking which session created it)'),
    sessionLabel: z.string().optional().describe('Human-readable label for the linked session (shown in UI)'),
    groupId: z.string().optional().describe('Group ID to organize this todo under (obtained from the claudit dashboard)'),
  },
  async ({ title, description, priority, sessionId, sessionLabel, groupId }) => {
    const task = createTask({
      title,
      description,
      status: 'pending',
      created_by: 'human',
      order: 0,
      retryCount: 0,
      priority: PRIORITY_MAP[priority ?? 'medium'],
      sessionId,
      sessionLabel,
      groupId,
    });
    return {
      content: [{ type: 'text' as const, text: `Created todo: ${task.id}\n${JSON.stringify(task, null, 2)}` }],
    };
  },
);

// --- update_todo ---
server.tool(
  'update_todo',
  'Update an existing todo. Only provided fields will be changed \u2014 omitted fields remain unchanged. Use this to mark todos complete, change priority, edit text, or move between groups.',
  {
    id: z.string().describe('The todo ID to update (UUID format, obtained from list_todos)'),
    title: z.string().optional().describe('New title to replace the existing one'),
    description: z.string().optional().describe('New description to replace the existing one'),
    completed: z.boolean().optional().describe('Set true to mark as done, false to reopen. Completing a todo automatically records a completedAt timestamp'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority level'),
    groupId: z.string().nullable().optional().describe('Move todo to a different group. Pass a group ID to assign, or null to remove from its current group'),
  },
  async ({ id, title, description, completed, priority, groupId }) => {
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = PRIORITY_MAP[priority];
    if (groupId !== undefined) updates.groupId = groupId;
    if (completed !== undefined) {
      updates.status = completed ? 'done' : 'pending';
      if (completed) updates.completedAt = new Date().toISOString();
    }

    const task = updateTask(id, updates);
    if (!task) {
      return {
        content: [{ type: 'text' as const, text: `Todo not found: ${id}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: `Updated todo: ${task.id}\n${JSON.stringify(task, null, 2)}` }],
    };
  },
);

// --- delete_todo ---
server.tool(
  'delete_todo',
  'Permanently delete a todo. This cannot be undone. Prefer marking as completed (update_todo with completed=true) unless the user explicitly wants to remove it.',
  {
    id: z.string().describe('The todo ID to delete (UUID format, obtained from list_todos)'),
  },
  async ({ id }) => {
    const deleted = deleteTask(id);
    if (!deleted) {
      return {
        content: [{ type: 'text' as const, text: `Todo not found: ${id}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: `Deleted todo: ${id}` }],
    };
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
