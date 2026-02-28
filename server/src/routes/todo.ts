import { Router } from 'express';
import {
  getAllTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
  reorderTodos,
} from '../services/todoStorage.js';
const router = Router();

// GET /api/todo — list all todos
router.get('/', (_req, res) => {
  try {
    res.json(getAllTodos());
  } catch (err) {
    console.error('Error fetching todos:', err);
    res.status(500).json({ error: 'Failed to fetch todos' });
  }
});

// POST /api/todo — create todo
router.post('/', (req, res) => {
  try {
    const { title, description, priority, sessionId, sessionLabel, groupId } = req.body;
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const todo = createTodo({
      title,
      description,
      completed: false,
      priority: priority ?? 'medium',
      sessionId,
      sessionLabel,
      groupId,
      position: 0, // will be auto-computed by createTodo
    });
    res.status(201).json(todo);
  } catch (err) {
    console.error('Error creating todo:', err);
    res.status(500).json({ error: 'Failed to create todo' });
  }
});

// PUT /api/todo/reorder — batch reorder todos
router.put('/reorder', (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      res.status(400).json({ error: 'items array is required' });
      return;
    }
    reorderTodos(items);
    res.json({ success: true });
  } catch (err) {
    console.error('Error reordering todos:', err);
    res.status(500).json({ error: 'Failed to reorder todos' });
  }
});

// PUT /api/todo/:id — update todo
router.put('/:id', (req, res) => {
  try {
    const todo = updateTodo(req.params.id, req.body);
    if (!todo) {
      res.status(404).json({ error: 'Todo not found' });
      return;
    }
    res.json(todo);
  } catch (err) {
    console.error('Error updating todo:', err);
    res.status(500).json({ error: 'Failed to update todo' });
  }
});

// DELETE /api/todo/:id — delete todo
router.delete('/:id', (req, res) => {
  try {
    const ok = deleteTodo(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Todo not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting todo:', err);
    res.status(500).json({ error: 'Failed to delete todo' });
  }
});

export default router;
