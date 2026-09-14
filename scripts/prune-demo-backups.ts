// One-time cleanup: deletes every backup in Storage bucket readsync-backups/demo-user
// except the one named below. Run once to reclaim storage space.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY not set — aborting.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const bucket = 'readsync-backups';
const folder = 'demo-user';
const keep = 'readsync-backup-2026-09-14.json';

async function main() {
  const { data: files, error: listError } = await supabase.storage
    .from(bucket)
    .list(folder, { limit: 1000 });

  if (listError) throw listError;

  const pathsToDelete = (files ?? [])
    .filter((file) => file.name !== keep)
    .map((file) => `${folder}/${file.name}`);

  if (pathsToDelete.length > 0) {
    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove(pathsToDelete);

    if (deleteError) throw deleteError;
  }

  console.log(`Deleted ${pathsToDelete.length} backups`);
}

main();
