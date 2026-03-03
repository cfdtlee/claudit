import { Router } from 'express';
import { DashboardData } from '../types.js';
import {
  countTasksByStatus,
  getTasksCompletedToday,
  getRecentTasks,
  getTokenUsageToday,
  getTasksByAssignee,
} from '../services/taskStorage.js';
import { getAllAgents } from '../services/agentStorage.js';
import { isMayorOnline, ensureMayorRunning, stopMayor, getMayorSessionId, getMayorProjectPath } from '../services/mayorService.js';
import { isWitnessRunning, getWitnessLastCheck } from '../services/witnessService.js';

const router = Router();

// GET /api/dashboard — aggregated dashboard data
router.get('/', (_req, res) => {
  try {
    const agents = getAllAgents();
    const activeAgents = agents.map(agent => {
      const tasks = getTasksByAssignee(agent.id);
      return {
        agent,
        runningSessions: tasks.filter(t => t.status === 'running').length,
        waitingSessions: tasks.filter(t => t.status === 'waiting').length,
      };
    }).filter(a => a.runningSessions > 0 || a.waitingSessions > 0);

    const data: DashboardData = {
      running: countTasksByStatus('running'),
      waiting: countTasksByStatus('waiting'),
      doneToday: getTasksCompletedToday().length,
      failed: countTasksByStatus('failed'),
      tokenUsageToday: getTokenUsageToday(),
      recentTasks: getRecentTasks(10),
      activeAgents,
      systemStatus: {
        mayorOnline: isMayorOnline(),
        mayorSessionId: getMayorSessionId() ?? undefined,
        mayorProjectPath: getMayorProjectPath(),
        witnessRunning: isWitnessRunning(),
        witnessLastCheck: getWitnessLastCheck(),
      },
    };

    res.json(data);
  } catch (err) {
    console.error('Error fetching dashboard:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// POST /api/dashboard/mayor/start
router.post('/mayor/start', async (_req, res) => {
  try {
    const sessionId = await ensureMayorRunning();
    res.json({ online: true, sessionId });
  } catch (err: any) {
    console.error('[dashboard] Failed to start mayor:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dashboard/mayor/stop
router.post('/mayor/stop', (_req, res) => {
  stopMayor();
  res.json({ online: false });
});

export default router;
