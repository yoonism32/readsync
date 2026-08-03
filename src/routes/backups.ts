import { Router } from 'express';
import pool from '../db/pool.js';
import { validateApiKey } from '../middleware/auth.js';
import { handleDbError } from '../middleware/errorHandler.js';
import { listBackups, runBackup } from '../services/BackupService.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

router.get('/api/v1/backups', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;
  try {
    const [files, lastSetting] = await Promise.all([
      listBackups(user_id),
      pool.query<{ value: string }>(
        `SELECT value FROM user_settings WHERE user_id = $1 AND key = 'last_backup_at'`,
        [user_id],
      ),
    ]);
    res.json({
      last_backup_at: lastSetting.rows[0]?.value ?? null,
      backups: files,
    });
  } catch (error) {
    handleDbError(res, error, 'List backups');
  }
});

router.post('/api/v1/backups/run', validateApiKey, async (req, res) => {
  const user_id = (req as AuthenticatedRequest).user.id;
  try {
    const file = await runBackup(user_id);
    res.json({ success: true, backup: file });
  } catch (error) {
    handleDbError(res, error, 'Run backup');
  }
});

export default router;
