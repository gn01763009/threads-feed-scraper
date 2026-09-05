import { Actor, log } from 'apify';
import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';
import { getExtractScript, DEBUG_SCRIPT } from './extract.js';
import { getReplyExtractScript } from './replies.js';
import { validateInput } from './validation.js';
import { buildSearchUrl, buildTagUrl, buildProfileUrl } from './urls.js';
import { mergeThreadChains } from './threads.js';
import { fetchEmbedPost } from './embed.js';
import { fetchSsrPosts } from './ssr.js';
import { fetchSearchPosts } from './search.js';
import type { NormalizedInput, RawInput, ThreadsPost, ThreadsReply, SourceType } from './types.js';

const HYDRATION_DELAY_MS = 3_000;
const SCROLL_DELAY_MS = 2_000;
const REPLY_SCROLL_COUNT = 3;
const MAX_REPLIES_PER_POST = 20;

interface RequestUserData {
    sourceType: SourceType;
    sourceQuery: string;
}

await Actor.init();

const rawInput = await Actor.getInput<RawInput>();

let input: NormalizedInput;
try {
    input = validateInput(rawInput);
} catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warning(`Input validation failed: ${message}. Exiting gracefully — no results to return.`);
    await Actor.exit();
    throw err; // unreachable, but satisfies TypeScript
}

const { maxPosts, scrollCount, mode } = input;
let totalItems = 0;

const requests: { url: string; userData: RequestUserData }[] = buildRequests(input);

log.info('Starting Threads scraper', {
    mode,
    usernames: input.usernames,
    keywords: input.keywords,
    postUrls: input.postUrls,
    feedUrls: input.feedUrls,
    searchSort: input.searchSort,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    totalRequests: requests.length,
    maxPosts,
    scrollCount,
});

function buildRequests(n: NormalizedInput): { url: string; userData: RequestUserData }[] {
    const out: { url: string; userData: RequestUserData }[] = [];
    const push = (url: string, sourceType: SourceType, sourceQuery: string) => {
        out.push({ url, userData: { sourceType, sourceQuery } });
    };

    switch (n.mode) {
        case 'user':
            for (const username of n.usernames) push(buildProfileUrl(username), 'profile', username);
            break;
        case 'hashtag':
            for (const kw of n.keywords) push(buildTagUrl(kw), 'tag', kw);
            break;
        case 'search':
            for (const kw of n.keywords) push(buildSearchUrl(kw, n.searchSort), 'search', kw);
            break;
        case 'post':
            for (const url of n.postUrls) push(url, 'post', url);
            break;
        case 'feed':
            for (const url of n.feedUrls) push(url, 'feed', url);
            break;
        default: {
            const _exhaustive: never = n.mode;
            throw new Error(`Unhandled mode: ${_exhaustive as string}`);
        }
    }
    return out;
}

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
                document
                    .querySelectorAll('div[style*="position: fixed"][style*="z-index"]')
                    .forEach((el) => el.remove());
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

            if (sourceType === 'search') {
                log.warning(
                    `Threads 搜尋對「${sourceQuery}」回 0 筆。Threads 把整串當一個詞匹配,如果是複合詞(例如「冥想正念」),拆成單一關鍵字分別跑會比較容易抓到結果(例如「冥想」+「正念」)。`,
                );
            }

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

/**
 * Profile pages carry their posts in the server-rendered payload, so `user` mode needs no
 * browser at all — see src/ssr.ts. This is both the fix for the 2026-09-05 outage (the DOM
 * path returns nothing now that Threads gates the rendered view behind a login wall) and a
 * large cost cut, since Playwright is the most expensive way to fetch anything.
 *
 * `search` and `hashtag` take the same road but through src/search.ts, which fans one keyword
 * out over several query forms because Threads serves logged-out clients no search cursor.
 * Only `feed` still needs the browser.
 */
async function runSsrRequests(): Promise<number> {
    const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration);
    if (!proxyConfiguration) {
        log.warning(
            'No proxy configured. Threads answers shared egress IPs with a blank page far more often — expect empty runs.',
        );
    }

    let pushed = 0;
    for (const { url, userData } of requests) {
        const { sourceType, sourceQuery } = userData;
        log.info(`Fetching ${sourceType}: ${url}`);

        const result = await fetchSsrPosts(url, {
            sourceType,
            sourceQuery,
            // A flagged proxy session keeps serving the block page, so every attempt takes a
            // fresh one — that is the difference between ~9/10 and ~0/10 success.
            newProxyUrl: proxyConfiguration
                ? async () => proxyConfiguration.newUrl(`ssr${Date.now()}${Math.random().toString(36).slice(2, 8)}`)
                : undefined,
            onAttempt: (attempt, outcome) => {
                if (outcome !== 'ok') log.debug(`Attempt ${attempt} for ${sourceQuery}: ${outcome}`);
            },
        });

        if (result.failure) {
            log.warning(
                `No posts for ${sourceType} "${sourceQuery}" after ${result.attempts} attempts (${result.failure}). ` +
                    'Threads throttles by exit IP; a different proxy group or a later retry usually clears it.',
            );
            continue;
        }

        const posts = filterByDateRange(result.posts).slice(0, maxPosts);
        await Dataset.pushData(posts);
        pushed += posts.length;
        log.info(`  ${posts.length} posts (${result.attempts} attempt(s))`);
    }
    return pushed;
}

/**
 * `search` and `hashtag` modes — one keyword fanned out over several query forms.
 *
 * Threads gives a logged-out client the first page of results and no way to ask for a second
 * (see src/search.ts for the evidence), so the only lever on depth is asking the question more
 * than one way. Measured ~5× the posts of a single request.
 */
async function runSearchRequests(): Promise<number> {
    const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration);
    if (!proxyConfiguration) {
        log.warning(
            'No proxy configured. Threads answers shared egress IPs with a blank page far more often — expect empty runs.',
        );
    }

    let pushed = 0;
    for (const { userData } of requests) {
        const { sourceType, sourceQuery } = userData;
        log.info(`Searching ${sourceType}: ${sourceQuery}`);

        const result = await fetchSearchPosts(sourceQuery, {
            sourceType,
            maxPosts,
            sort: input.searchSort,
            newProxyUrl: proxyConfiguration
                ? async () => proxyConfiguration.newUrl(`search${Date.now()}${Math.random().toString(36).slice(2, 8)}`)
                : undefined,
            onVariant: (v) =>
                log.debug(`  ${v.kind}: ${v.outcome}, ${v.found} found, ${v.added} new (${v.attempts} attempt(s))`),
        });

        if (result.failure) {
            log.warning(
                `No page served for "${sourceQuery}" after ${result.attempts} attempts (${result.failure}). ` +
                    'Threads throttles by exit IP; a different proxy group or a later retry usually clears it.',
            );
            continue;
        }

        const posts = filterByDateRange(result.posts).slice(0, maxPosts);
        if (posts.length === 0) {
            log.info(`  no results for "${sourceQuery}"`);
            continue;
        }

        await Dataset.pushData(posts);
        pushed += posts.length;
        log.info(
            `  ${posts.length} posts from ${result.variants.length} query form(s), ${result.attempts} request(s)`,
        );
    }
    return pushed;
}

/**
 * `post` mode reads Threads' public embed card — see src/embed.ts. The rendered post page
 * gives a browser nothing now (login wall) and carries no server-rendered payload either,
 * so the card is the only logged-out source left. It costs one small HTTP GET per post.
 */
async function runEmbedRequests(): Promise<number> {
    const proxyConfiguration = await Actor.createProxyConfiguration(input.proxyConfiguration);
    let pushed = 0;

    for (const { url, userData } of requests) {
        log.info(`Fetching post: ${url}`);
        const result = await fetchEmbedPost(url, {
            newProxyUrl: proxyConfiguration
                ? async () => proxyConfiguration.newUrl(`embed${Date.now()}${Math.random().toString(36).slice(2, 8)}`)
                : undefined,
        });

        if (!result.post) {
            // "unavailable" is an answer about the post (deleted/private), not a failure of
            // ours — say which one it is rather than logging the same line for both.
            log.warning(
                result.failure === 'unavailable'
                    ? `Post is not available (deleted, private, or wrong URL): ${url}`
                    : `Could not fetch ${url} after ${result.attempts} attempts — Threads throttles by exit IP; retry later.`,
            );
            continue;
        }

        const posts = filterByDateRange([result.post]);
        if (posts.length === 0) {
            log.info('  outside the requested date range');
            continue;
        }
        await Dataset.pushData(posts);
        pushed += posts.length;
        log.info(`  ok (${result.attempts} attempt(s))`);
        void userData;
    }
    return pushed;
}

if (mode === 'user') {
    totalItems += await runSsrRequests();
} else if (mode === 'search' || mode === 'hashtag') {
    totalItems += await runSearchRequests();
} else if (mode === 'post') {
    totalItems += await runEmbedRequests();
} else {
    await crawler.run(requests);
}

log.info(`Scraping complete. Total items: ${totalItems}`);

// Run telemetry: push usage data to developer's own dataset via API
const telemetryDatasetId = process.env.TELEMETRY_DATASET_ID;
const telemetryToken = process.env.TELEMETRY_TOKEN;
if (telemetryDatasetId && telemetryToken) {
    try {
        const telemetryPayload = {
            runId: Actor.getEnv().actorRunId,
            sourceTypes: requests.map((r) => r.userData.sourceType),
            queries: requests.map((r) => r.userData.sourceQuery),
            postCount: totalItems,
            requestCount: requests.length,
            mode: input.mode,
            scrollCount: input.scrollCount,
            maxPosts: input.maxPosts,
            searchSort: input.searchSort ?? 'top',
            hasDateFilter: !!(input.dateFrom || input.dateTo),
            actorVersion: '1.0',
            timestamp: new Date().toISOString(),
        };
        const res = await fetch(
            `https://api.apify.com/v2/datasets/${telemetryDatasetId}/items?token=${telemetryToken}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([telemetryPayload]),
            },
        );
        if (res.ok) {
            log.debug('Run telemetry recorded');
        } else {
            log.warning(`Telemetry push failed: ${res.status}`);
        }
    } catch (err) {
        log.warning('Failed to record run telemetry', { error: (err as Error).message });
    }
}

await Actor.exit();
