import { Actor, log } from 'apify';
import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';
import { getExtractScript, DEBUG_SCRIPT } from './extract.js';
import { validateInput } from './validation.js';
import { buildSearchUrl, buildTagUrl } from './urls.js';
import type { InputSchema, ThreadsPost, SourceType } from './types.js';

const HYDRATION_DELAY_MS = 3_000;
const SCROLL_DELAY_MS = 2_000;

interface RequestUserData {
    sourceType: SourceType;
    sourceQuery: string;
}

await Actor.init();

const rawInput = await Actor.getInput<InputSchema>();
const input = validateInput(rawInput);

const maxPosts = input.maxPosts ?? 50;
const scrollCount = input.scrollCount ?? 5;
let totalItems = 0;

const sources: Array<[string[] | undefined, (q: string) => string, SourceType]> = [
    [input.feedUrls, (u) => u, 'feed'],
    [input.searchKeywords, buildSearchUrl, 'search'],
    [input.searchTags, buildTagUrl, 'tag'],
];

const requests: { url: string; userData: RequestUserData }[] = [];
for (const [items, buildUrl, sourceType] of sources) {
    for (const query of items ?? []) {
        requests.push({ url: buildUrl(query), userData: { sourceType, sourceQuery: query } });
    }
}

log.info('Starting Threads scraper', {
    feedUrls: input.feedUrls,
    searchKeywords: input.searchKeywords,
    searchTags: input.searchTags,
    totalRequests: requests.length,
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
        const { sourceType, sourceQuery } = request.userData as RequestUserData;
        log.info(`Navigating to ${sourceType}: ${request.url}`);

        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
            log.warning('Network idle timeout — proceeding with available content');
        });

        await page.waitForTimeout(HYDRATION_DELAY_MS);

        for (let i = 0; i < scrollCount; i++) {
            await page.evaluate('window.scrollBy(0, window.innerHeight * 2)');
            await page.waitForTimeout(SCROLL_DELAY_MS);
            log.info(`Scroll ${i + 1}/${scrollCount} complete`);
        }

        const extractScript = getExtractScript(maxPosts, sourceType, sourceQuery);
        const posts: ThreadsPost[] = await page.evaluate(extractScript);

        log.info(`Extracted ${posts.length} posts from ${sourceType}:${sourceQuery}`);

        if (posts.length === 0) {
            const debugInfo = await page.evaluate(DEBUG_SCRIPT);
            log.warning('No posts found. Page structure:', debugInfo as Record<string, unknown>);

            const screenshotKey = `debug-screenshot-${sourceType}-${Date.now()}`;
            const screenshot = await page.screenshot({ fullPage: false });
            await Actor.setValue(screenshotKey, screenshot, { contentType: 'image/png' });
            log.info(`Debug screenshot saved as "${screenshotKey}"`);
        } else {
            await Dataset.pushData(posts);
            totalItems += posts.length;
        }
    },

    failedRequestHandler(_ctx, error) {
        log.error(`Request failed: ${_ctx.request.url}`, { error: (error as Error).message });
    },
});

await crawler.run(requests);

log.info(`Scraping complete. Total items: ${totalItems}`);

await Actor.exit();
