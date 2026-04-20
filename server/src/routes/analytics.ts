import { Router } from 'express';
import { getEvents, getStats, cleanupOldEvents } from '../services/analytics.js';

const router = Router();

// GET /api/analytics/events?event=xxx&limit=100&offset=0&since=2024-01-01
router.get('/events', (req, res) => {
  try {
    const events = getEvents({
      event: req.query.event as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
      since: req.query.since as string | undefined,
    });
    res.json(events);
  } catch (err: any) {
    console.error('[analytics] GET /events error:', err.message);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /api/analytics/stats
router.get('/stats', (_req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (err: any) {
    console.error('[analytics] GET /stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// DELETE /api/analytics/events
router.delete('/events', (_req, res) => {
  try {
    const deleted = cleanupOldEvents(0); // 0 days = delete all
    res.json({ deleted });
  } catch (err: any) {
    console.error('[analytics] DELETE /events error:', err.message);
    res.status(500).json({ error: 'Failed to clear events' });
  }
});

export default router;
