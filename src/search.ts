/**
 * Keyword and hashtag search without an account — breadth by fan-out, because paging is shut.
 *
 * Threads serves the first page of search results to logged-out clients inside the same Relay
 * preloader payload that profile pages use (see src/ssr.ts), so one plain HTTP GET returns real
 * results with no browser and no login. What it does *not* serve anonymously is the second page:
 *
 *   - The 417 JS bundles a logged-out browser loads (36.7 MB, 132 persisted queries, measured
 *     2026-09-06) contain no `BarcelonaSearchResultsQuery` and no `…RefetchableQuery`. The
 *     "load more" code is simply not shipped to logged-out clients.
 *   - The payload's own cursors are blanked: 19 × `"cursor":""`, `"end_cursor":null`,
 *     `"has_next_page":false`.
 *   - Calling the query anyway with the variables a logged-in browser sends returns
 *     `invalid_variable_type` on every one of 6 different exit IPs — an identity gate, not a
 *     throttle, and not something a different proxy or a fixed variable list can get past.
 *
 * So depth cannot come from paging. It comes from asking the same question several ways: each
 * query form returns its own ~15 results, and the sets barely overlap. Measured on 貓咪:
 *
 *   | form                    | new posts |
 *   |-------------------------|-----------|
 *   | q=貓咪 (top)            | baseline  |
 *   | q=貓咪&serp_type=recent | +60, zero overlap with top |
 *   | q=#貓咪                 | +63       |
 *   | q=貓咪&serp_type=tags   | +19       |
 *
 * ~5× the coverage of a single request. Re-issuing the *same* form is not worth it: repeating
 * one query five times saturated at 1.8× after the second call, so this module varies the form
 * rather than the attempt count.
 */

import { gotScraping } from 'got-scraping';

import { extractSsrPosts, isSoftBlocked, mapSsrPost } from './ssr.js';
import type { SearchSort, SourceType, ThreadsPost } from './types.js';

const SEARCH_BASE = 'https://www.threads.com/search';

/**
 * Smallest response that can carry the payload.
 *
 * Threads answers the same URL either with the app shell or with the server-rendered payload,
 * and the split is by exit IP (8 of 12 concurrent IPs got the payload). The two are far apart
 * in size — every shell measured 261-263 KB, every page carrying the payload 553-1219 KB — so
 * this threshold sits in a 2× gap rather than on a boundary. It counts string length rather
 * than bytes; every measurement above was taken the same way, and since non-ASCII text only
 * makes the byte count larger, the comparison errs towards calling a page a shell, never the
 * other way round.
 *
 * Size is what separates "we were served the shell" (retry: another IP will do better) from
 * "the query genuinely has no results" (do not retry: a 553 KB page with zero posts is an
 * answer). Post count alone cannot tell them apart — both have none.
 */
const MIN_PAYLOAD_CHARS = 400_000;

/** Which way a keyword is being asked. */
export type SearchVariantKind = 'top' | 'recent' | 'hashtag' | 'tags';

export interface SearchVariant {
    kind: SearchVariantKind;
    url: string;
}

export interface SearchVariantReport {
    kind: SearchVariantKind;
    /** Posts this form returned, before de-duplication. */
    found: number;
    /** Posts it contributed that no earlier form had. */
    added: number;
    attempts: number;
    outcome: 'ok' | 'empty' | 'soft-blocked' | 'no-payload' | 'error';
}

export interface SearchFetchResult {
    posts: ThreadsPost[];
    /** Total HTTP requests across every form, for cost logging. */
    attempts: number;
    variants: SearchVariantReport[];
    /** Set only when no form produced a usable page at all. */
    failure?: 'soft-blocked' | 'no-payload';
}

/** True when the response carries the Relay payload rather than the bare app shell. */
export function hasSsrPayload(html: string): boolean {
    return html.length >= MIN_PAYLOAD_CHARS;
}

function variantUrl(query: string, serpType: string): string {
    const url = new URL(SEARCH_BASE);
    url.searchParams.set('q', query);
    url.searchParams.set('serp_type', serpType);
    return url.toString();
}

/**
 * The query forms to try for one keyword, most-wanted first.
 *
 * Order matters because callers stop once `maxPosts` is satisfied: a run asking for 20 posts
 * should spend its two requests on the sort the user actually chose. `recent` and `top` are
 * disjoint result sets, so whichever is not requested still earns its place further down.
 */
export function buildSearchVariants(keyword: string, sort?: SearchSort): SearchVariant[] {
    const bare = keyword.startsWith('#') ? keyword.slice(1) : keyword;
    const hashtagged = `#${bare}`;

    const byKind: Record<SearchVariantKind, SearchVariant> = {
        top: { kind: 'top', url: variantUrl(bare, 'default') },
        recent: { kind: 'recent', url: variantUrl(bare, 'recent') },
        hashtag: { kind: 'hashtag', url: variantUrl(hashtagged, 'default') },
        tags: { kind: 'tags', url: variantUrl(bare, 'tags') },
    };

    // A keyword the caller already wrote as "#foo" makes `top` and `hashtag` the same request.
    const order: SearchVariantKind[] =
        sort === 'recent' ? ['recent', 'top', 'hashtag', 'tags'] : ['top', 'recent', 'hashtag', 'tags'];
    const wanted = keyword.startsWith('#') ? order.filter((k) => k !== 'top') : order;

    return wanted.map((kind) => byKind[kind]);
}

interface VariantFetch {
    html: string | null;
    attempts: number;
    outcome: 'ok' | 'soft-blocked' | 'no-payload' | 'error';
}

/**
 * Fetch one query form until the response actually carries the payload.
 *
 * Every attempt takes a fresh proxy session: a flagged session keeps answering with the shell,
 * so retrying on the same one cannot succeed. A page that carries the payload ends the loop
 * even when it holds no posts — that is a real "no results", not a block.
 */
async function fetchVariant(
    url: string,
    maxAttempts: number,
    newProxyUrl?: () => Promise<string | undefined>,
): Promise<VariantFetch> {
    let outcome: VariantFetch['outcome'] = 'no-payload';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const proxyUrl = await newProxyUrl?.();
            const { body } = await gotScraping({ url, proxyUrl, timeout: { request: 30_000 } });

            if (hasSsrPayload(body)) return { html: body, attempts: attempt, outcome: 'ok' };
            outcome = isSoftBlocked(body) ? 'soft-blocked' : 'no-payload';
        } catch {
            outcome = 'error';
        }
    }

    return { html: null, attempts: maxAttempts, outcome };
}

/**
 * A page that arrived but held nothing is `empty`, not a failure: the query has no results.
 * Only a page that never arrived carries the fetch's own outcome.
 */
function variantOutcome(fetched: VariantFetch, found: number): SearchVariantReport['outcome'] {
    if (fetched.html === null) return fetched.outcome;
    return found > 0 ? 'ok' : 'empty';
}

export interface SearchFetchOptions {
    sourceType: SourceType;
    /** Stop once this many distinct posts are collected. */
    maxPosts: number;
    sort?: SearchSort;
    newProxyUrl?: () => Promise<string | undefined>;
    /** Attempts per query form. Forms are independent, so this is not a total. */
    maxAttempts?: number;
    onVariant?: (report: SearchVariantReport) => void;
}

/**
 * Collect posts for one keyword across every query form, de-duplicated by post id.
 *
 * Stops as soon as `maxPosts` is reached so a small run does not pay for four requests to
 * fill an order of fifteen.
 */
export async function fetchSearchPosts(keyword: string, options: SearchFetchOptions): Promise<SearchFetchResult> {
    const maxAttempts = options.maxAttempts ?? 3;
    const byId = new Map<string, ThreadsPost>();
    const variants: SearchVariantReport[] = [];
    let attempts = 0;
    let sawPage = false;

    for (const variant of buildSearchVariants(keyword, options.sort)) {
        if (byId.size >= options.maxPosts) break;

        const fetched = await fetchVariant(variant.url, maxAttempts, options.newProxyUrl);
        attempts += fetched.attempts;

        const before = byId.size;
        const raws = fetched.html === null ? [] : extractSsrPosts(fetched.html);
        if (fetched.html !== null) {
            sawPage = true;
            for (const raw of raws) {
                if (raw.pk && !byId.has(raw.pk)) {
                    byId.set(raw.pk, mapSsrPost(raw, options.sourceType, keyword));
                }
            }
        }

        const found = raws.length;
        const report: SearchVariantReport = {
            kind: variant.kind,
            found,
            added: byId.size - before,
            attempts: fetched.attempts,
            outcome: variantOutcome(fetched, found),
        };
        variants.push(report);
        options.onVariant?.(report);
    }

    const posts = [...byId.values()].slice(0, options.maxPosts);
    if (sawPage || posts.length > 0) return { posts, attempts, variants };

    // Nothing was ever served — say which wall we hit rather than reporting an empty search.
    const blocked = variants.some((v) => v.outcome === 'soft-blocked');
    return { posts, attempts, variants, failure: blocked ? 'soft-blocked' : 'no-payload' };
}
