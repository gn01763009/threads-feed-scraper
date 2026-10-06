import { Actor, log } from 'apify';
import { createRunBudget, parseRunLimit, pushWithinBudget } from './budget.js';
import { validateInput } from './validation.js';
import { buildSearchUrl, buildTagUrl, buildProfileUrl } from './urls.js';
import { fetchEmbedPost } from './embed.js';
import { fetchSsrPosts } from './ssr.js';
import { fetchSearchPosts } from './search.js';
import type { NormalizedInput, RawInput, ThreadsPost, SourceType } from './types.js';

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
    // A bad input is a failed run, not an empty success: the caller must see it, and a SUCCEEDED run
    // with 0 rows still bills the start fee.
    log.error(`Input validation failed: ${message}`);
    await Actor.fail(`Invalid input: ${message}`);
    throw err; // unreachable (Actor.fail exits), but satisfies TypeScript
}

const { maxPosts, scrollCount, mode } = input;
let totalItems = 0;
// ACTOR_MAX_PAID_DATASET_ITEMS is the platform's per-run ceiling; rows past it would be charged but never agreed to.
const budget = createRunBudget(parseRunLimit(process.env.ACTOR_MAX_PAID_DATASET_ITEMS));
const pushPosts = (posts: readonly ThreadsPost[]): Promise<number> =>
    pushWithinBudget(budget, posts, (rows) => Actor.pushData(rows));

const requests: { url: string; userData: RequestUserData }[] = buildRequests(input);

log.info('Starting Threads scraper', {
    mode,
    usernames: input.usernames,
    keywords: input.keywords,
    postUrls: input.postUrls,
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

/**
 * Profile pages carry their posts in the server-rendered payload, so `user` mode needs no
 * browser at all — see src/ssr.ts. This is both the fix for the 2026-09-05 outage (the DOM
 * path returns nothing now that Threads gates the rendered view behind a login wall) and a
 * large cost cut, since Playwright is the most expensive way to fetch anything.
 *
 * `search` and `hashtag` take the same road but through src/search.ts, which fans one keyword
 * out over several query forms because Threads serves logged-out clients no search cursor.
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
        if (budget.isExhausted()) break;
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

        const count = await pushPosts(filterByDateRange(result.posts).slice(0, maxPosts));
        pushed += count;
        log.info(`  ${count} posts (${result.attempts} attempt(s))`);
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
        if (budget.isExhausted()) break;
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

        const count = await pushPosts(posts);
        pushed += count;
        log.info(
            `  ${count} posts from ${result.variants.length} query form(s), ${result.attempts} request(s)`,
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
        if (budget.isExhausted()) break;
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
        pushed += await pushPosts(posts);
        log.info(`  ok (${result.attempts} attempt(s))`);
        void userData;
    }
    return pushed;
}

if (mode === 'user') {
    totalItems += await runSsrRequests();
} else if (mode === 'search' || mode === 'hashtag') {
    totalItems += await runSearchRequests();
} else {
    totalItems += await runEmbedRequests();
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
