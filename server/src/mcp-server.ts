#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  getAllTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
} from './services/todoStorage.js';

const server = new McpServer({
  name: 'claudit-todos',
  version: '0.1.0',
});

// --- list_todos ---
server.tool(
  'list_todos',
  'List all todos. Optionally filter by status (pending/completed) and priority (low/medium/high).',
  {
    status: z.enum(['pending', 'completed', 'all']).optional().describe('Filter by completion status. Default: all'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('Filter by priority level'),
    groupId: z.string().optional().describe('Filter by group ID. Use "ungrouped" for todos without a group.'),
  },
  async ({ status, priority, groupId }) => {
    let todos = getAllTodos();
    if (status === 'pending') todos = todos.filter(t => !t.completed);
    else if (status === 'completed') todos = todos.filter(t => t.completed);
    if (priority) todos = todos.filter(t => t.priority === priority);
    if (groupId === 'ungrouped') todos = todos.filter(t => !t.groupId);
    else if (groupId) todos = todos.filter(t => t.groupId === groupId);

    const summary = todos.map(t => ({
      id: t.id,
      title: t.title,
      description: t.description,
      completed: t.completed,
      priority: t.priority,
      groupId: t.groupId,
      position: t.position,
      createdAt: t.createdAt,
      completedAt: t.completedAt,
      sessionId: t.sessionId,
    }));

    return {
      content: [{
        type: 'text' as const,
        text: todos.length === 0
          ? 'No todos found.'
          : JSON.stringify(summary, null, 2),
      }],
    };
  },
);

// --- get_todo ---
server.tool(
  'get_todo',
  'Get full details of a specific todo by ID.',
  {
    id: z.string().describe('The todo ID'),
  },
  async ({ id }) => {
    const todo = getTodo(id);
    if (!todo) {
      return {
        content: [{ type: 'text' as const, text: `Todo not found: ${id}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(todo, null, 2) }],
    };
  },
);

// --- create_todo ---
server.tool(
  'create_todo',
  'Create a new todo item.',
  {
    title: z.string().describe('Title of the todo'),
    description: z.string().optional().describe('Detailed description'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('Priority level. Default: medium'),
    sessionId: z.string().optional().describe('Link to a Claude session ID'),
    sessionLabel: z.string().optional().describe('Display label for the linked session'),
    groupId: z.string().optional().describe('Group ID to assign the todo to'),
  },
  async ({ title, description, priority, sessionId, sessionLabel, groupId }) => {
    const todo = createTodo({
      title,
      description,
      completed: false,
      priority: priority || 'medium',
      sessionId,
      sessionLabel,
      groupId,
      position: 0, // auto-computed
    });
    return {
      content: [{ type: 'text' as const, text: `Created todo: ${todo.id}\n${JSON.stringify(todo, null, 2)}` }],
    };
  },
);

// --- update_todo ---
server.tool(
  'update_todo',
  'Update an existing todo. Only provided fields will be changed.',
  {
    id: z.string().describe('The todo ID to update'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    completed: z.boolean().optional().describe('Mark as completed (true) or pending (false)'),
    priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority level'),
    groupId: z.string().nullable().optional().describe('Group ID to move the todo to (null to ungroup)'),
  },
  async ({ id, title, description, completed, priority, groupId }) => {
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (groupId !== undefined) updates.groupId = groupId;
    if (completed !== undefined) {
      updates.completed = completed;
      if (completed) updates.completedAt = new Date().toISOString();
    }

    const todo = updateTodo(id, updates);
    if (!todo) {
      return {
        content: [{ type: 'text' as const, text: `Todo not found: ${id}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: `Updated todo: ${todo.id}\n${JSON.stringify(todo, null, 2)}` }],
    };
  },
);

// --- delete_todo ---
server.tool(
  'delete_todo',
  'Delete a todo by ID.',
  {
    id: z.string().describe('The todo ID to delete'),
  },
  async ({ id }) => {
    const deleted = deleteTodo(id);
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
