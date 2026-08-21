const MAX_PROBE_URLS = 6;
const PROBE_BATCH_SIZE = 3;
const PROBE_BATCH_DELAY_MS = 5_000;
const PROBE_TIMEOUT_MS = 20_000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export interface NovelArrowProbeResult {
  slug: string;
  url: string;
  status: number;
  elapsed_ms: number;
  decoded_bytes?: number;
  title?: string | null;
  latest_chapter?: string | null;
  cf_ray?: string | null;
  cf_mitigated?: string | null;
  challenge_script_present?: boolean;
  challenged?: boolean;
  ok: boolean;
  error: string | null;
}

interface ProbeTarget {
  slug: string;
  url: string;
}

export interface NovelArrowProbeResponse {
  summary: string;
  tested_at: string;
  batch_size: number;
  batch_delay_ms: number;
  results: NovelArrowProbeResult[];
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function parseNovelArrowProbeUrls(values: unknown): ProbeTarget[] {
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > MAX_PROBE_URLS
  ) {
    throw new Error(`Provide between 1 and ${MAX_PROBE_URLS} URLs`);
  }

  return values.map((value) => {
    if (typeof value !== 'string') {
      throw new Error('Every probe URL must be a string');
    }

    let parsed: URL;
    try {
      parsed = new URL(value.trim());
    } catch {
      throw new Error(`Invalid URL: ${value}`);
    }

    const match = parsed.pathname.match(
      /^\/novel\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/,
    );
    if (
      parsed.protocol !== 'https:' ||
      parsed.hostname !== 'novelarrow.com' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.search ||
      parsed.hash ||
      !match
    ) {
      throw new Error(
        'Only exact https://novelarrow.com/novel/<slug> URLs are allowed',
      );
    }

    return { slug: match[1], url: parsed.toString() };
  });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMetaContent(html: string, name: string): string | null {
  const escapedName = escapeRegex(name);
  const nameThenContent = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escapedName}["'][^>]+content=["']([^"']*)["']`,
    'i',
  );
  const contentThenName = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escapedName}["']`,
    'i',
  );
  return (
    html.match(nameThenContent)?.[1] ?? html.match(contentThenName)?.[1] ?? null
  );
}

export async function probeNovelArrowUrl(
  target: ProbeTarget,
): Promise<NovelArrowProbeResult> {
  const startedAt = performance.now();
  try {
    const response = await fetch(target.url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-GB,en;q=0.9',
      },
    });
    const body = await response.text();
    const title = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? null;
    const latestChapter = extractMetaContent(
      body,
      'og:novel:latest_chapter_name',
    );
    const cfMitigated = response.headers.get('cf-mitigated');
    const challenged =
      cfMitigated === 'challenge' ||
      /just a moment/i.test(title ?? '') ||
      response.status === 403 ||
      response.status === 429;
    const redirected = response.status >= 300 && response.status < 400;
    const ok =
      response.ok && !challenged && !redirected && latestChapter !== null;

    let error: string | null = null;
    if (challenged) error = 'Cloudflare challenge';
    else if (redirected) error = 'Unexpected redirect';
    else if (!response.ok) error = `HTTP ${response.status}`;
    else if (!latestChapter) error = 'Latest-chapter metadata missing';

    return {
      slug: target.slug,
      url: target.url,
      status: response.status,
      elapsed_ms: Math.round(performance.now() - startedAt),
      decoded_bytes: Buffer.byteLength(body),
      title,
      latest_chapter: latestChapter,
      cf_ray: response.headers.get('cf-ray'),
      cf_mitigated: cfMitigated,
      challenge_script_present: /challenge-platform/i.test(body),
      challenged,
      ok,
      error,
    };
  } catch (error) {
    return {
      slug: target.slug,
      url: target.url,
      status: 0,
      elapsed_ms: Math.round(performance.now() - startedAt),
      ok: false,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
}

export async function runNovelArrowProbe(
  values: unknown,
): Promise<NovelArrowProbeResponse> {
  const targets = parseNovelArrowProbeUrls(values);
  const results: NovelArrowProbeResult[] = [];

  for (let start = 0; start < targets.length; start += PROBE_BATCH_SIZE) {
    const batch = targets.slice(start, start + PROBE_BATCH_SIZE);
    results.push(...(await Promise.all(batch.map(probeNovelArrowUrl))));
    if (start + PROBE_BATCH_SIZE < targets.length) {
      await sleep(PROBE_BATCH_DELAY_MS);
    }
  }

  const usable = results.filter((result) => result.ok).length;
  return {
    summary: `${usable}/${results.length} responses usable`,
    tested_at: new Date().toISOString(),
    batch_size: PROBE_BATCH_SIZE,
    batch_delay_ms: PROBE_BATCH_DELAY_MS,
    results,
  };
}
