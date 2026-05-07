import { Router } from 'express';
import { HTTP_NOT_FOUND } from '../config.js';
import pool from '../db/pool.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.get('/api/v1/devices', validateApiKey, async (req, res) => {
  const { include_inactive } = req.query as { include_inactive?: string };
  const user_id = (req as AuthenticatedRequest).user.id;

  try {
    const result = await pool.query(
      `
      SELECT id, device_label, device_type, last_seen, active,
             (SELECT COUNT(*) FROM progress_snapshots WHERE device_id = d.id) AS total_snapshots,
             (SELECT MAX(created_at) FROM progress_snapshots WHERE device_id = d.id) AS last_activity
      FROM devices d
      WHERE user_id = $1 ${include_inactive === 'true' ? '' : 'AND active = TRUE'}
      ORDER BY last_seen DESC
    `,
      [user_id],
    );

    res.json(result.rows);
  } catch (error) {
    handleDbError(res, error, 'Get devices');
  }
});

router.put('/api/v1/devices/:deviceId', validateApiKey, async (req, res) => {
  const { deviceId } = req.params;
  const { device_label, active } = req.body as {
    device_label?: string;
    active?: boolean;
  };
  const user_id = (req as AuthenticatedRequest).user.id;

  try {
    const updates: string[] = [];
    const params: unknown[] = [user_id];
    let paramIndex = 1;

    if (device_label) {
      updates.push(`device_label = $${++paramIndex}`);
      params.push(device_label);
    }
    if (active !== undefined) {
      updates.push(`active = $${++paramIndex}`);
      params.push(Boolean(active));
    }

    if (updates.length === 0) {
      return res.json({ success: true, message: 'No changes provided' });
    }

    updates.push(`last_seen = CURRENT_TIMESTAMP`);
    params.push(deviceId);

    const result = await pool.query(
      `
      UPDATE devices
      SET ${updates.join(', ')}
      WHERE user_id = $1 AND id = $${params.length}
      RETURNING id
    `,
      params,
    );

    if (result.rows.length === 0) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Device not found' });
    }

    res.json({ success: true });
  } catch (error) {
    handleDbError(res, error, 'Update device');
  }
});

router.delete('/api/v1/devices/:deviceId', validateApiKey, async (req, res) => {
  const { deviceId } = req.params;
  const user_id = (req as AuthenticatedRequest).user.id;

  try {
    const result = await pool.query(
      `
      UPDATE devices
      SET active = FALSE, last_seen = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND id = $2
      RETURNING id
    `,
      [user_id, deviceId],
    );

    if (result.rows.length === 0) {
      return res.status(HTTP_NOT_FOUND).json({ error: 'Device not found' });
    }

    res.json({ success: true, deactivated: true });
  } catch (error) {
    handleDbError(res, error, 'Deactivate device');
  }
});

export default router;
