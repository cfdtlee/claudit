import { Router } from 'express';
import { TaskStatus } from '../types.js';
import {
  getAllTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  updateTaskStatus,
  getSubtasks,
} from '../services/taskStorage.js';
import { getTaskSessions } from '../services/taskSessionStorage.js';
const router = Router();

// GET /api/tasks — list (with ?projectId, ?assignee, ?status filters)
router.get('/', (req, res) => {
  try {
    const filters: any = {};
    if (req.query.projectId) filters.projectId = req.query.projectId;
    if (req.query.assignee) filters.assignee = req.query.assignee;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.groupId) filters.groupId = req.query.groupId;
    res.json(getAllTasks(filters));
  } catch (err) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// PUT /api/tasks/reorder — batch reorder (must be before /:id)
router.put('/reorder', (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'items array is required' });
      return;
    }
    reorderTasks(items);
    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering tasks:', err);
    res.status(500).json({ error: 'Failed to reorder tasks' });
  }
});

// GET /api/tasks/:id — get one (includes subtasks)
router.get('/:id', (req, res) => {
  try {
    const task = getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const subtasks = getSubtasks(req.params.id);
    res.json({ ...task, subtasks });
  } catch (err) {
    console.error('Error fetching task:', err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// POST /api/tasks — create
router.post('/', (req, res) => {
  try {
    const { title } = req.body;
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const task = createTask({
      title,
      description: req.body.description,
      prompt: req.body.prompt,
      status: req.body.status ?? 'pending',
      created_by: req.body.created_by ?? 'human',
      order: req.body.order ?? 0,
      retryCount: 0,
      errorMessage: req.body.errorMessage,
      priority: req.body.priority,
      parent_id: req.body.parent_id,
      discovered_from: req.body.discovered_from,
      blocked_by: req.body.blocked_by,
      assignee: req.body.assignee,
      projectId: req.body.projectId,
      groupId: req.body.groupId,
      sessionId: req.body.sessionId,
      sessionLabel: req.body.sessionLabel,
      worktreeId: req.body.worktreeId,
      branch: req.body.branch,
      prUrl: req.body.prUrl,
      workingDir: req.body.workingDir,
      model: req.body.model,
      permissionMode: req.body.permissionMode,
      maxRetries: req.body.maxRetries,
      timeoutMs: req.body.timeoutMs,
      taskType: req.body.taskType,
      completionMode: req.body.completionMode,
      acceptanceCriteria: req.body.acceptanceCriteria,
      tags: req.body.tags,
      dueDate: req.body.dueDate,
    });
    res.status(201).json(task);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT /api/tasks/:id — update
router.put('/:id', (req, res) => {
  try {
    const task = updateTask(req.params.id, req.body);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json(task);
  } catch (err) {
    console.error('Error updating task:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// DELETE /api/tasks/:id — delete
router.delete('/:id', (req, res) => {
  try {
    const ok = deleteTask(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting task:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// PATCH /api/tasks/:id/status — transition status
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    const task = updateTaskStatus(req.params.id, status as TaskStatus);
    if (!task) {
      res.status(400).json({ error: 'Invalid status transition or task not found' });
      return;
    }
    res.json(task);
  } catch (err) {
    console.error('Error updating task status:', err);
    res.status(500).json({ error: 'Failed to update task status' });
  }
});

// GET /api/tasks/:id/sessions — get task session history
router.get('/:id/sessions', (req, res) => {
  try {
    const task = getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    res.json(getTaskSessions(req.params.id));
  } catch (err) {
    console.error('Error fetching task sessions:', err);
    res.status(500).json({ error: 'Failed to fetch task sessions' });
  }
});

export default router;
