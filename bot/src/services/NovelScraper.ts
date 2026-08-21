import chromium from '@sparticuz/chromium';
import type { Browser, Page } from 'puppeteer-core';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
  BROWSER_TIMEOUT_MS,
  CLOUDFLARE_WAIT_MS,
  COOLDOWN_403_MS,
  COOLDOWN_429_MS,
  MIN_GLOBAL_GAP_MS,
} from '../config.js';
import { deriveNovelBaseUrl } from '../parseNovelInfo.js';

puppeteer.use(StealthPlugin());

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class NovelScraperClass {
  private browserInstance: Browser | null = null;
  private browserLaunchInProgress = false;
  private lastNovelbinRequestAt = 0;
  private novelbinBlockedUntil = 0;

  private async getBrowser(): Promise<Browser> {
    while (this.browserLaunchInProgress) {
      await sleep(100);
    }

    if (this.browserInstance?.connected) {
      return this.browserInstance;
    }

    this.browserLaunchInProgress = true;
    try {
      console.log('Launching Puppeteer browser with Chromium + Stealth...');
      this.browserInstance = (await puppeteer.launch({
        args: chromium.args,
        defaultViewport: null,
        executablePath: await chromium.executablePath(),
        headless: true,
      })) as unknown as Browser;
      console.log('Browser launched successfully (stealth mode enabled)');
      return this.browserInstance;
    } catch (error) {
      this.browserInstance = null;
      throw error;
    } finally {
      this.browserLaunchInProgress = false;
    }
  }

  async closeBrowser(): Promise<void> {
    if (this.browserInstance) {
      try {
        await this.browserInstance.close();
        console.log('🔒 Browser closed');
      } catch (error) {
        console.error('Error closing browser:', error);
      }
      this.browserInstance = null;
    }
  }

  private async waitForGlobalScrapeSlot(): Promise<void> {
    const now = Date.now();

    if (now < this.novelbinBlockedUntil) {
      const waitLeft = Math.ceil((this.novelbinBlockedUntil - now) / 1000);
      throw new Error(`NovelBin globally blocked for ${waitLeft}s`);
    }

    const gap = now - this.lastNovelbinRequestAt;
    if (gap < MIN_GLOBAL_GAP_MS) {
      const waitTime = MIN_GLOBAL_GAP_MS - gap;
      console.log(
        `⏳ Waiting ${Math.ceil(waitTime / 1000)}s before next request...`,
      );
      await sleep(waitTime);
    }

    this.lastNovelbinRequestAt = Date.now();
  }

  /** Guaranteed page cleanup: opens a page, runs fn, always closes the page. */
  private async withBrowser<T>(fn: (page: Page) => Promise<T>): Promise<T> {
    const browser = await this.getBrowser();
    const page = (await browser.newPage()) as Page;
    try {
      return await fn(page);
    } finally {
      try {
        await page.close();
      } catch (e) {
        console.error('Error closing page:', (e as Error).message);
      }
    }
  }

  async fetchNovelMainPage(novelUrl: string): Promise<string> {
    await this.waitForGlobalScrapeSlot();

    try {
      return await this.withBrowser(async (page) => {
        const baseUrl = deriveNovelBaseUrl(novelUrl);

        // Set realistic viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Set user agent
        await page.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        );

        console.log(`🌐 Navigating to: ${baseUrl}`);

        await page.goto(baseUrl, {
          waitUntil: 'domcontentloaded',
          timeout: BROWSER_TIMEOUT_MS,
        });

        // Real-time monitoring during Cloudflare challenge
        console.log('⏳ Watching page load in real-time...');
        const startTime = Date.now();
        const checkInterval = 2000; // Check every 2 seconds
        const maxWaitTime = CLOUDFLARE_WAIT_MS + 5000; // 8s + 5s buffer

        let foundContent = false;

        while (Date.now() - startTime < maxWaitTime && !foundContent) {
          await sleep(checkInterval);

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const pageTitle = await page.title();

          const hasCloudflare = await page.evaluate(
            () =>
              document.body.innerHTML.includes('Just a moment') ||
              document.body.innerHTML.includes('challenge-platform'),
          );

          const contentChecks = await page.evaluate(() => ({
            hasLChapter: !!document.querySelector('.l-chapter'),
            hasMeta: !!document.querySelector(
              'meta[property*="novel"], meta[name*="og:novel"]',
            ),
            hasNovelTitle: !!document.querySelector(
              '.novel-title, .book-title, h1',
            ),
            bodySize: document.body.innerHTML.length,
            visibleText:
              document.body.textContent
                ?.trim()
                .substring(0, 100)
                .replace(/\s+/g, ' ') ?? '',
          }));

          console.log(`   [${elapsed}s] Title: "${pageTitle}"`);
          console.log(
            `   [${elapsed}s] Cloudflare=${hasCloudflare ? 'YES' : 'NO'} | ` +
              `l-chapter=${contentChecks.hasLChapter ? 'YES' : 'NO'} | ` +
              `meta=${contentChecks.hasMeta ? 'YES' : 'NO'} | ` +
              `size=${(contentChecks.bodySize / 1024).toFixed(0)}KB`,
          );
          console.log(
            `   [${elapsed}s] Preview: "${contentChecks.visibleText}..."`,
          );

          if (
            !hasCloudflare &&
            (contentChecks.hasLChapter || contentChecks.hasMeta)
          ) {
            console.log(
              `   [${elapsed}s] Novel content detected! Stopping early.`,
            );
            foundContent = true;
          }
        }

        // Get final HTML
        const html = await page.content();
        console.log('Page fetch complete, parsing...');
        return html;
      });
    } catch (error) {
      const msg = (error as Error).message;
      console.error('Browser fetch failed:', msg);

      // Handle specific error codes
      if (msg.includes('403')) {
        console.error('Got 403 - setting cooldown');
        this.novelbinBlockedUntil = Date.now() + COOLDOWN_403_MS;
      } else if (msg.includes('429')) {
        console.error('Got 429 - setting cooldown');
        this.novelbinBlockedUntil = Date.now() + COOLDOWN_429_MS;
      }

      // If browser crashed, clear the instance
      if (msg.includes('Target closed') || msg.includes('Session closed')) {
        this.browserInstance = null;
      }

      throw error;
    }
  }
}

export const NovelScraper = new NovelScraperClass();
