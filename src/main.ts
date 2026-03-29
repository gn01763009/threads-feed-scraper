import { Actor, log } from 'apify';
import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';
import { getExtractScript, getDebugScript } from './extract.js';
import type { ThreadsPost } from './extract.js';

interface InputSchema {
    feedUrls: string[];
    maxPosts?: number;
    scrollCount?: number;
}

await Actor.init();

const input = await Actor.getInput<InputSchema>();

if (!input?.feedUrls || input.feedUrls.length === 0) {
    throw new Error('At least one feedUrls entry is required');
}

const maxPosts = input.maxPosts ?? 50;
const scrollCount = input.scrollCount ?? 5;

log.info('Starting Threads custom feed scraper', {
    feedUrls: input.feedUrls,
    maxPosts,
    scrollCount,
});

const crawler = new PlaywrightCrawler({
    headless: true,
    maxConcurrency: 1,
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 120,
    launchContext: {
        launchOptions: {
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
            ],
        },
    },
    async requestHandler({ page, request }) {
        const feedUrl = request.url;
        log.info(`Navigating to feed: ${feedUrl}`);

        // Wait for initial content to render
        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
            log.warning('Network idle timeout — proceeding with available content');
        });

        // Give React time to hydrate
        await page.waitForTimeout(3_000);

        // Scroll to load more posts
        for (let i = 0; i < scrollCount; i++) {
            await page.evaluate('window.scrollBy(0, window.innerHeight * 2)');
            await page.waitForTimeout(2_000);
            log.info(`Scroll ${i + 1}/${scrollCount} complete`);
        }

        // Extract posts using string-based evaluate to avoid tsx transpiler issues
        const extractScript = getExtractScript(maxPosts, feedUrl);
        const posts: ThreadsPost[] = await page.evaluate(extractScript);

        log.info(`Extracted ${posts.length} posts from ${feedUrl}`);

        if (posts.length === 0) {
            // Debug: capture page structure
            const debugScript = getDebugScript();
            const debugInfo = await page.evaluate(debugScript);
            log.warning('No posts found. Page structure:', debugInfo as Record<string, unknown>);

            // Take screenshot for debugging
            const screenshot = await page.screenshot({ fullPage: false });
            await Actor.setValue('debug-screenshot', screenshot, { contentType: 'image/png' });
            log.info('Debug screenshot saved to key-value store as "debug-screenshot"');
        }

        await Dataset.pushData(posts);
    },

    failedRequestHandler(_ctx, error) {
        log.error(`Request failed: ${_ctx.request.url}`, { error: (error as Error).message });
    },
});

await crawler.run(input.feedUrls);

const dataset = await Dataset.open();
const info = await dataset.getInfo();
log.info(`Scraping complete. Total items: ${info?.itemCount ?? 0}`);

await Actor.exit();
