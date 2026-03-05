import { Task, TaskStatus, TaskSession } from '../types';

export async function fetchTasks(filters?: { projectId?: string; assignee?: string; status?: TaskStatus; groupId?: string }): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.projectId) params.set('projectId', filters.projectId);
  if (filters?.assignee) params.set('assignee', filters.assignee);
  if (filters?.status) params.set('status', filters.status);
  if (filters?.groupId) params.set('groupId', filters.groupId);
  const qs = params.toString();
  const res = await fetch(`/api/tasks${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

export async function fetchTask(id: string): Promise<Task & { subtasks: Task[] }> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`);
  if (!res.ok) throw new Error('Failed to fetch task');
  return res.json();
}

export async function createTask(data: {
  title: string;
  description?: string;
  prompt?: string;
  priority?: number;
  taskType?: string;
  assignee?: string;
  projectId?: string;
  groupId?: string;
  sessionId?: string;
  sessionLabel?: string;
  parent_id?: string;
  completionMode?: string;
  model?: string;
  permissionMode?: string;
  tags?: string[];
  dueDate?: string;
  workingDir?: string;
}): Promise<Task> {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create task');
  return res.json();
}

export async function updateTask(id: string, data: Partial<Task>): Promise<Task> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update task');
  return res.json();
}

export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete task');
}

export async function reorderTasks(items: { id: string; order: number }[]): Promise<void> {
  const res = await fetch('/api/tasks/reorder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error('Failed to reorder tasks');
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update task status');
  return res.json();
}

export async function fetchTaskSessions(taskId: string): Promise<TaskSession[]> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/sessions`);
  if (!res.ok) throw new Error('Failed to fetch task sessions');
  return res.json();
}
