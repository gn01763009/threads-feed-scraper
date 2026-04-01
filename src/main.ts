import { Actor, log } from 'apify';
import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';
import { getExtractScript, DEBUG_SCRIPT } from './extract.js';
import { getReplyExtractScript } from './replies.js';
import { validateInput } from './validation.js';
import { buildSearchUrl, buildTagUrl, buildProfileUrl, buildPostUrl } from './urls.js';
import type { InputSchema, ThreadsPost, ThreadsReply, SourceType } from './types.js';

const HYDRATION_DELAY_MS = 3_000;
const SCROLL_DELAY_MS = 2_000;
const REPLY_SCROLL_COUNT = 3;
const MAX_REPLIES_PER_POST = 20;

interface RequestUserData {
    sourceType: SourceType;
    sourceQuery: string;
}

await Actor.init();

const rawInput = await Actor.getInput<InputSchema>();

let input: InputSchema;
try {
    input = validateInput(rawInput);
} catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Input validation failed: ${message}`);
    await Actor.fail(message);
    throw err; // unreachable, but satisfies TypeScript
}

const maxPosts = input.maxPosts ?? 50;
const scrollCount = input.scrollCount ?? 5;
let totalItems = 0;

const sources: Array<[string[] | undefined, (q: string) => string, SourceType]> = [
    [input.feedUrls, (u) => u, 'feed'],
    [input.searchKeywords, (k) => buildSearchUrl(k, input.searchSort), 'search'],
    [input.searchTags, buildTagUrl, 'tag'],
    [input.profileUrls, (u) => u, 'profile'],
    [input.postUrls, (u) => u, 'post'],
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
    profileUrls: input.profileUrls,
    postUrls: input.postUrls,
    searchSort: input.searchSort,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    totalRequests: requests.length,
    maxPosts,
    scrollCount,
});

function filterByDateRange(posts: readonly ThreadsPost[]): ThreadsPost[] {
    if (!input.dateFrom && !input.dateTo) return [...posts];

    return posts.filter((post) => {
        if (!post.publishedAtISO) return true;
        const postDate = post.publishedAtISO.slice(0, 10);
        if (input.dateFrom && postDate < input.dateFrom) return false;
        if (input.dateTo && postDate > input.dateTo) return false;
        return true;
    });
}

const crawler = new PlaywrightCrawler({
    headless: true,
    maxConcurrency: 1,
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 120,
    launchContext: {
        launchOptions: {
            args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
        },
    },
    async requestHandler({ page, request }) {
        const { sourceType, sourceQuery } = request.userData as RequestUserData;
        log.info(`Navigating to ${sourceType}: ${request.url}`);

        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
            log.warning('Network idle timeout — proceeding with available content');
        });

        await page.waitForTimeout(HYDRATION_DELAY_MS);

        if (sourceType === 'post') {
            for (let i = 0; i < REPLY_SCROLL_COUNT; i++) {
                await page.evaluate('window.scrollBy(0, window.innerHeight * 2)');
                await page.waitForTimeout(SCROLL_DELAY_MS);
            }

            const extractScript = getExtractScript(1, sourceType, sourceQuery);
            const posts: ThreadsPost[] = await page.evaluate(extractScript);

            if (posts.length > 0) {
                const replyScript = getReplyExtractScript(MAX_REPLIES_PER_POST);
                const replies: ThreadsReply[] = await page.evaluate(replyScript);
                const postsWithReplies = posts.map((post) => ({ ...post, replies }));

                const filtered = filterByDateRange(postsWithReplies);
                if (filtered.length > 0) {
                    await Dataset.pushData(filtered);
                    totalItems += filtered.length;
                }
                log.info(`Extracted post with ${replies.length} replies from ${sourceQuery}`);
            } else {
                const debugInfo = await page.evaluate(DEBUG_SCRIPT);
                log.warning('No post found on detail page. Structure:', debugInfo as Record<string, unknown>);
            }
            return;
        }

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
            const filtered = filterByDateRange(posts);
            if (filtered.length > 0) {
                await Dataset.pushData(filtered);
                totalItems += filtered.length;
            }
            log.info(`After date filter: ${filtered.length}/${posts.length} posts kept`);
        }
    },

    failedRequestHandler(_ctx, error) {
        log.error(`Request failed: ${_ctx.request.url}`, { error: (error as Error).message });
    },
});

await crawler.run(requests);

log.info(`Scraping complete. Total items: ${totalItems}`);

await Actor.exit();
