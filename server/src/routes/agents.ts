import { Router } from 'express';
import {
  getAllAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
} from '../services/agentStorage.js';
const router = Router();

// GET /api/agents — list all
router.get('/', (_req, res) => {
  try {
    res.json(getAllAgents());
  } catch (err) {
    console.error('Error fetching agents:', err);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

// GET /api/agents/:id — get one
router.get('/:id', (req, res) => {
  try {
    const agent = getAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  } catch (err) {
    console.error('Error fetching agent:', err);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
});

// POST /api/agents — create
router.post('/', (req, res) => {
  try {
    const { name, systemPrompt } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const agent = createAgent({
      name,
      systemPrompt: systemPrompt ?? '',
      avatar: req.body.avatar,
      specialty: req.body.specialty,
      recentSummary: req.body.recentSummary,
      lastActiveAt: req.body.lastActiveAt,
    });
    res.status(201).json(agent);
  } catch (err) {
    console.error('Error creating agent:', err);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// PUT /api/agents/:id — update
router.put('/:id', (req, res) => {
  try {
    const agent = updateAgent(req.params.id, req.body);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json(agent);
  } catch (err) {
    console.error('Error updating agent:', err);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// DELETE /api/agents/:id — delete
router.delete('/:id', (req, res) => {
  try {
    const ok = deleteAgent(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting agent:', err);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

export default router;
