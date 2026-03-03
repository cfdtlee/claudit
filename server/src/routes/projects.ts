import { Router } from 'express';
import {
  getAllProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
} from '../services/projectStorage.js';
const router = Router();

// GET /api/projects — list all
router.get('/', (_req, res) => {
  try {
    res.json(getAllProjects());
  } catch (err) {
    console.error('Error fetching projects:', err);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET /api/projects/:id — get one
router.get('/:id', (req, res) => {
  try {
    const project = getProject(req.params.id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (err) {
    console.error('Error fetching project:', err);
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// POST /api/projects — create
router.post('/', (req, res) => {
  try {
    const { name, repoPath } = req.body;
    if (!name || !repoPath) {
      res.status(400).json({ error: 'name and repoPath are required' });
      return;
    }
    const project = createProject({
      name,
      repoPath,
      description: req.body.description,
      branch: req.body.branch,
      defaultAgentId: req.body.defaultAgentId,
      defaultModel: req.body.defaultModel,
      defaultPermissionMode: req.body.defaultPermissionMode,
    });
    res.status(201).json(project);
  } catch (err) {
    console.error('Error creating project:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id — update
router.put('/:id', (req, res) => {
  try {
    const project = updateProject(req.params.id, req.body);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json(project);
  } catch (err) {
    console.error('Error updating project:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id — delete
router.delete('/:id', (req, res) => {
  try {
    const ok = deleteProject(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
