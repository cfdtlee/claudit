import { Router } from 'express';
import { getSettingsObject, updateSettings } from '../services/settingsStorage.js';
const router = Router();

// GET /api/settings — get all settings
router.get('/', (_req, res) => {
  try {
    res.json(getSettingsObject());
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings — bulk update settings
router.put('/', (req, res) => {
  try {
    const config = updateSettings(req.body);
    res.json(config);
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
