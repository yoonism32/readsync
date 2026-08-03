import pool from '../db/pool.js';

export interface ExportData {
  export_date: string;
  user_id: string;
  novels: unknown[];
  progress: unknown[];
  bookmarks: unknown[];
  notes: unknown[];
  categories: unknown[];
}

/** Full user data export — shared by GET /export and the backup job. */
export async function buildExport(userId: string): Promise<ExportData> {
  const [novels, progress, bookmarks, notes, categories] = await Promise.all([
    pool.query(
      `SELECT n.*, m.status, m.favorite, m.rating, m.notes, m.started_at, m.completed_at FROM novels n LEFT JOIN user_novel_meta m ON m.novel_id = n.id AND m.user_id = $1 WHERE EXISTS (SELECT 1 FROM progress_snapshots p WHERE p.novel_id = n.id AND p.user_id = $1) ORDER BY n.title`,
      [userId],
    ),
    pool.query(
      'SELECT DISTINCT ON (novel_id) * FROM progress_snapshots WHERE user_id = $1 ORDER BY novel_id, created_at DESC',
      [userId],
    ),
    pool.query(
      'SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    ),
    pool.query(
      'SELECT * FROM novel_notes WHERE user_id = $1 ORDER BY created_at DESC',
      [userId],
    ),
    pool.query(
      'SELECT * FROM novel_categories WHERE user_id = $1 ORDER BY category',
      [userId],
    ),
  ]);

  return {
    export_date: new Date().toISOString(),
    user_id: userId,
    novels: novels.rows,
    progress: progress.rows,
    bookmarks: bookmarks.rows,
    notes: notes.rows,
    categories: categories.rows,
  };
}
