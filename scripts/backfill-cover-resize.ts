// One-time backfill: re-uploads every already-mirrored novel cover through
// resizeCoverForDisplay(), so existing Storage objects pick up the same
// 540px-wide/quality-78 re-encode that src/routes/covers.ts's
// commitMirroredCover() now applies to *new* uploads. isMirroredCover() means
// the app never re-touches a cover once mirrored, so every cover mirrored
// before that fix landed is stuck at full source resolution forever —
// Lighthouse measured 200-380KB originals on /explorer alone (65 of them,
// 6.3MB of a 6.6MB page). This re-encodes the same bytes already in the
// bucket (not re-fetched from the source site) purely to shrink them.
//
// Mirrors scripts/backfill-cover-cache-control.ts's approach: read the novel
// list via a direct Postgres connection rather than supabase-js's .from(),
// since PostgREST has been unreliable for this project; Storage's API is
// unaffected and still goes through supabase-js as normal.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';
import { normalizeSlug, resizeCoverForDisplay } from '../src/routes/covers.js';

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

  console.log(`Found ${novels.length} mirrored covers to resize.`);

  let shrunk = 0;
  let alreadySmall = 0;
  let failed = 0;
  let totalBefore = 0;
  let totalAfter = 0;

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

      const before = Buffer.from(await blob.arrayBuffer());
      const after = await resizeCoverForDisplay(before);
      totalBefore += before.length;
      totalAfter += after.length;

      // Re-encoding an already-small cover can occasionally grow it slightly
      // (JPEG re-compression overhead) — skip the write when there's nothing
      // to gain, so re-running this script is a safe no-op on later covers.
      if (after.length >= before.length) {
        alreadySmall++;
        console.log(`  skip: ${fileName} already ${Math.round(before.length / 1024)}KB`);
        continue;
      }

      const { error: uploadError } = await supabase.storage
        .from('novel-covers')
        .upload(fileName, after, {
          contentType: 'image/jpeg',
          upsert: true,
          cacheControl: CACHE_CONTROL_SECONDS,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      shrunk++;
      console.log(
        `  ok: ${fileName} ${Math.round(before.length / 1024)}KB -> ${Math.round(after.length / 1024)}KB`,
      );
    } catch (e) {
      failed++;
      console.error(`  FAILED: ${fileName} — ${(e as Error).message}`);
    }
  }

  console.log(
    `\nDone. ${shrunk} shrunk, ${alreadySmall} already small, ${failed} failed.`,
  );
  console.log(
    `Total: ${Math.round(totalBefore / 1024 / 1024)}MB -> ${Math.round(totalAfter / 1024 / 1024)}MB`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main();
