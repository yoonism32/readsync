/**
 * Regression test for cover image resizing.
 *
 * commitMirroredCover() used to upload source bytes as-is. Lighthouse
 * measured 200-380KB originals on /explorer alone (65 covers, 6.3MB of a
 * 6.6MB page) despite nothing ever displaying a cover past 168px CSS width
 * (Novel.tsx's detail-page art, the largest consumer). resizeCoverForDisplay()
 * is the shared choke point both mirror paths (GET's server fetch, the
 * userscript's POST) funnel through, so fixing it here fixes every route.
 */
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { resizeCoverForDisplay } from '../../src/routes/covers.js';

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 80, b: 200 },
    },
  })
    .jpeg({ quality: 100 })
    .toBuffer();
}

describe('resizeCoverForDisplay', () => {
  it('downscales an oversized cover to the display max width', async () => {
    const source = await makeJpeg(1200, 1680); // typical scraped source resolution
    const resized = await resizeCoverForDisplay(source);
    const meta = await sharp(resized).metadata();

    expect(meta.width).toBe(540);
    expect(resized.length).toBeLessThan(source.length);
  });

  it('does not enlarge a cover already smaller than the display max width', async () => {
    const source = await makeJpeg(300, 420);
    const resized = await resizeCoverForDisplay(source);
    const meta = await sharp(resized).metadata();

    expect(meta.width).toBe(300);
  });

  it('always outputs a valid JPEG', async () => {
    const source = await makeJpeg(800, 1120);
    const resized = await resizeCoverForDisplay(source);
    const meta = await sharp(resized).metadata();

    expect(meta.format).toBe('jpeg');
  });
});
