import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import diagnosticsRouter from '../../src/routes/diagnostics.js';
import {
  parseNovelArrowProbeUrls,
  probeNovelArrowUrl,
} from '../../src/services/NovelArrowProbe.js';

const URL =
  'https://novelarrow.com/novel/unparalleled-after-ten-consecutive-draws';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NovelArrow Render probe URL validation', () => {
  it('accepts only exact NovelArrow novel URLs', () => {
    expect(parseNovelArrowProbeUrls([URL])).toEqual([
      {
        slug: 'unparalleled-after-ten-consecutive-draws',
        url: URL,
      },
    ]);

    expect(() =>
      parseNovelArrowProbeUrls(['https://example.com/novel/test']),
    ).toThrow(/only exact/i);
    expect(() =>
      parseNovelArrowProbeUrls([
        'https://novelarrow.com/novel/test?redirect=http://127.0.0.1',
      ]),
    ).toThrow(/only exact/i);
  });

  it('caps a run at six URLs', () => {
    expect(() => parseNovelArrowProbeUrls(Array(7).fill(URL))).toThrow(
      /between 1 and 6/i,
    );
  });
});

describe('NovelArrow Render probe classification', () => {
  it('does not mistake the injected challenge-platform script for a challenge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          `<html><head>
            <title>Example Novel | NovelArrow</title>
            <meta name="og:novel:latest_chapter_name" content="Chapter 2511 Final">
          </head><body><script src="/cdn-cgi/challenge-platform/test.js"></script></body></html>`,
          {
            status: 200,
            headers: { 'cf-ray': 'test-ray-LHR' },
          },
        ),
      ),
    );

    const result = await probeNovelArrowUrl({
      slug: 'example',
      url: 'https://novelarrow.com/novel/example',
    });

    expect(result).toMatchObject({
      status: 200,
      latest_chapter: 'Chapter 2511 Final',
      challenge_script_present: true,
      challenged: false,
      ok: true,
      error: null,
    });
  });

  it('recognizes Cloudflare cf-mitigated challenge responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html><title>Just a moment...</title></html>', {
          status: 200,
          headers: { 'cf-mitigated': 'challenge' },
        }),
      ),
    );

    const result = await probeNovelArrowUrl({
      slug: 'example',
      url: 'https://novelarrow.com/novel/example',
    });

    expect(result).toMatchObject({
      challenged: true,
      ok: false,
      error: 'Cloudflare challenge',
    });
  });
});

describe('POST /api/v1/admin/diagnostics/novelarrow', () => {
  it('requires an API key before running a probe', async () => {
    const app = express();
    app.use(express.json());
    app.use(diagnosticsRouter);

    const response = await request(app)
      .post('/api/v1/admin/diagnostics/novelarrow')
      .send({ urls: [URL] });

    expect(response.status).toBe(401);
  });
});
