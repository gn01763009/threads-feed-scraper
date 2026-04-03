import { Actor, log } from 'apify';
import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';
import { getExtractScript, DEBUG_SCRIPT } from './extract.js';
import { getReplyExtractScript } from './replies.js';
import { validateInput } from './validation.js';
import { buildSearchUrl, buildTagUrl, buildProfileUrl, buildPostUrl } from './urls.js';
import { mergeThreadChains } from './threads.js';
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

        const dismissModal = async () => {
            const hasDialog = await page.evaluate(() => !!document.querySelector('div[role="dialog"]'));
            if (!hasDialog) return;

            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);

            await page.evaluate(() => {
                const dialog = document.querySelector('div[role="dialog"]');
                if (!dialog) return;
                const allButtons = Array.from(dialog.querySelectorAll('[role="button"], button'));
                for (const btn of allButtons) {
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const text = (btn.textContent || '').trim().toLowerCase();
                    if (ariaLabel.includes('close') || text === 'x' || text === '✕') {
                        (btn as HTMLElement).click();
                        return;
                    }
                }
                dialog.remove();
                document.querySelectorAll('div[style*="position: fixed"][style*="z-index"]').forEach((el) => el.remove());
            });

            log.info('Dismissed login/signup modal');
        };

        await dismissModal();

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

        // Incremental extraction to handle DOM virtualization — Threads removes
        // older posts from the DOM as new ones load.
        const allPosts = new Map<string, ThreadsPost>();
        const extractScript = getExtractScript(maxPosts, sourceType, sourceQuery);
        const hasDateFilter = !!(input.dateFrom || input.dateTo);
        let inRangeCount = 0;

        const isInDateRange = (post: ThreadsPost): boolean => {
            if (!hasDateFilter) return true;
            if (!post.publishedAtISO) return true;
            const postDate = post.publishedAtISO.slice(0, 10);
            if (input.dateFrom && postDate < input.dateFrom) return false;
            if (input.dateTo && postDate > input.dateTo) return false;
            return true;
        };

        const collectPosts = async (): Promise<ThreadsPost[]> => {
            const batch: ThreadsPost[] = await page.evaluate(extractScript);
            for (const post of batch) {
                if (!allPosts.has(post.postId)) {
                    allPosts.set(post.postId, post);
                    if (isInDateRange(post)) inRangeCount++;
                }
            }
            return batch;
        };

        const hasScrolledPastDateRange = (batch: readonly ThreadsPost[]): boolean => {
            if (!input.dateFrom) return false;
            const dated = batch.filter((p) => p.publishedAtISO);
            if (dated.length === 0) return false;
            return dated.every((p) => p.publishedAtISO!.slice(0, 10) < input.dateFrom!);
        };

        const MAX_STALE_SCROLLS = 5;
        await collectPosts();

        let staleScrolls = 0;
        for (let i = 0; i < scrollCount; i++) {
            if (inRangeCount >= maxPosts) break;

            const loadMoreClicked = await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('div[role="button"], button, span[role="link"]'));
                for (const btn of buttons) {
                    const text = (btn.textContent || '').trim().toLowerCase();
                    if (text.includes('show more') || text.includes('顯示更多') || text.includes('load more')) {
                        (btn as HTMLElement).click();
                        return text;
                    }
                }
                return null;
            });

            if (loadMoreClicked) {
                log.info(`Clicked load-more button: "${loadMoreClicked}"`);
                await page.waitForTimeout(SCROLL_DELAY_MS);
            }

            await dismissModal();
            await page.evaluate('window.scrollBy(0, window.innerHeight * 2)');
            await page.waitForTimeout(SCROLL_DELAY_MS);
            await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});

            const prevSize = allPosts.size;
            const latestBatch = await collectPosts();

            log.info(`Scroll ${i + 1}/${scrollCount} — ${allPosts.size} total, ${inRangeCount} in date range`);

            if (hasScrolledPastDateRange(latestBatch)) {
                log.info('All visible posts are before dateFrom, stopping scroll');
                break;
            }

            if (allPosts.size === prevSize) {
                staleScrolls++;
                if (staleScrolls >= MAX_STALE_SCROLLS) {
                    log.info(`No new posts after ${MAX_STALE_SCROLLS} consecutive scrolls, stopping early`);
                    break;
                }
            } else {
                staleScrolls = 0;
            }
        }

        const filtered = filterByDateRange([...allPosts.values()]);
        const merged = mergeThreadChains(filtered);
        const posts = merged.slice(0, maxPosts);
        const chainCount = merged.filter((p) => p.threadParts && p.threadParts.length > 1).length;

        log.info(
            `Extracted ${allPosts.size} raw → ${filtered.length} in date range → ${merged.length} after merging chains (${chainCount} thread chains found)`,
        );

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

    failedRequestHandler({ request }, error) {
        log.error(`Request failed: ${request.url}`, { error: (error as Error).message });
    },
});

await crawler.run(requests);

log.info(`Scraping complete. Total items: ${totalItems}`);

await Actor.exit();
