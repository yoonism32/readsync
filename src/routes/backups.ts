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
    // Not a database error — handleDbError would log/alert it as one. An
    // oversized export is an expected, already-diagnosed condition for a
    // specific account, not an incident worth paging on.
    if ((error as { code?: string }).code === 'BACKUP_TOO_LARGE') {
      res.status(413).json({ error: (error as Error).message });
      return;
    }
    handleDbError(res, error, 'Run backup');
  }
});

export default router;
