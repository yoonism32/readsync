// One-time backfill: re-uploads every already-mirrored novel cover with
// cacheControl set, so existing Storage objects pick up the 1-year cache
// header that src/routes/covers.ts's commitMirroredCover() only applies to
// *new* uploads (commit 77424e7, 2026-08-12). isMirroredCover() means the
// app never re-touches a cover once mirrored, so the ~138 covers mirrored
// before that fix landed were stuck on Storage's no-cache default forever —
// re-served in full on every page view. This re-uploads the same bytes
// already in the bucket (not re-fetched from the source site) purely to
// refresh the object's cache-control metadata.
//
// The novel list is read via a direct Postgres connection (like the app's
// own src/db/pool.ts), not supabase-js's .from() — PostgREST is currently
// returning PGRST002 ("could not query the database for the schema cache"),
// most likely Supabase throttling the REST API for this project while it's
// over its egress quota. Storage's API is unaffected, so uploads/downloads
// below still go through supabase-js as normal.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? '';
const DATABASE_URL = process.env.DATABASE_URL ?? '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !DATABASE_URL) {
  console.error(
    'SUPABASE_URL / SUPABASE_SERVICE_KEY / DATABASE_URL not set — aborting.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const MIRRORED_PATH = '/storage/v1/object/public/novel-covers/';
const CACHE_CONTROL_SECONDS = '31536000'; // 1 year — matches commitMirroredCover()

// Mirrors src/routes/covers.ts's normalizeSlug(): legacy novelbin: prefix
// never appears in the on-disk filename.
function normalizeSlug(novelId: string): string {
  return String(novelId).replace(/^novelbin:/, '');
}

async function main() {
  const pg = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  let novels: { id: string; cover_img: string }[];
  try {
    const result = await pg.query<{ id: string; cover_img: string }>(
      'SELECT id, cover_img FROM novels WHERE cover_img LIKE $1',
      [`%${MIRRORED_PATH}%`],
    );
    novels = result.rows;
  } finally {
    await pg.end();
  }

  console.log(`Found ${novels.length} mirrored covers to backfill.`);

  let ok = 0;
  let failed = 0;

  for (const novel of novels) {
    const slug = normalizeSlug(novel.id);
    const fileName = `${slug}.jpg`;

    try {
      const { data: blob, error: downloadError } = await supabase.storage
        .from('novel-covers')
        .download(fileName);

      if (downloadError || !blob) {
        throw new Error(downloadError?.message ?? 'empty download');
      }

      const buffer = Buffer.from(await blob.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('novel-covers')
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
          cacheControl: CACHE_CONTROL_SECONDS,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      ok++;
      console.log(`  ok: ${fileName} (${Math.round(buffer.length / 1024)}KB)`);
    } catch (e) {
      failed++;
      console.error(`  FAILED: ${fileName} — ${(e as Error).message}`);
    }
  }

  console.log(`\nDone. ${ok} refreshed, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
