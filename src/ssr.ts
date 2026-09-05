/**
 * Server-rendered payload extraction — the no-browser, no-login path.
 *
 * Threads ships profile pages with the post data already embedded in the HTML as a Relay
 * preloader payload, even though the rendered DOM shows a login wall and never paints the
 * posts. So the login wall gates the *view*, not the data: one plain HTTP GET is enough.
 *
 * Verified 2026-09-05, after the DOM scraper started returning SUCCEEDED-with-0-items for
 * every mode:
 *   - `https://www.threads.com/@zuck` over a datacenter proxy → 10 posts with author,
 *     text, like/reply/repost/quote counts, media URLs and exact timestamps.
 *   - A browser was never needed. This is also far cheaper than Playwright, which is the
 *     last-resort tier in the portfolio's cost rules.
 *
 * Two things this module has to cope with:
 *   1. Threads answers the same URL in three ways — the full payload (~775 KB), a bare
 *      app shell with no payload (~268 KB), or a soft-block page carrying "Something went
 *      wrong". Only the first is usable, so callers retry.
 *   2. A proxy session that has been flagged stays flagged: reusing one session retries
 *      into the same wall forever. Every attempt therefore gets a fresh session id, which
 *      measured 9/10 successful fetches versus near-zero when a session was reused.
 *
 * Post pages carry no payload, so `post` mode reads the public embed card instead (src/embed.ts).
 *
 * Search and hashtag pages *do* carry it — the note that used to sit here saying they did not
 * was wrong, and it cost a working search mode. What they lack is a usable cursor, so breadth
 * has to come from asking several query forms rather than from paging; src/search.ts does that
 * on top of the helpers below.
 */

import { gotScraping } from 'got-scraping';

import type { MediaType, SourceType, ThreadsMedia, ThreadsPost } from './types.js';

/** Marks the start of every embedded post array in the payload. */
const THREAD_ITEMS_KEY = '"thread_items":';

/** Threads' soft-block page. Renders 200 OK, so the body is the only tell. */
const SOFT_BLOCK_MARKER = 'Something went wrong';

/** Instagram-family media type codes, as they appear in the payload. */
const MEDIA_TYPE_VIDEO = 2;

export interface SsrFetchResult {
    posts: ThreadsPost[];
    /** How many fetches it took, for cost logging. */
    attempts: number;
    /** Set when every attempt came back soft-blocked or shell-only. */
    failure?: 'soft-blocked' | 'no-payload';
}

/** Shape of the payload objects we read. Everything is optional — it is third-party JSON. */
interface SsrRawPost {
    pk?: string;
    code?: string;
    canonical_url?: string;
    taken_at?: number;
    like_count?: number;
    media_type?: number;
    caption?: { text?: string } | null;
    user?: { username?: string } | null;
    image_versions2?: { candidates?: { url?: string }[] } | null;
    video_versions?: { url?: string }[] | null;
    carousel_media?: SsrRawPost[] | null;
    text_post_app_info?: {
        direct_reply_count?: number;
        repost_count?: number;
        quote_count?: number;
        reshare_count?: number;
        is_reply?: boolean;
    } | null;
}

/**
 * Read one balanced JSON value out of `source` starting at `start`.
 *
 * The payload is not a standalone `<script type="application/json">` block — it sits inside
 * a bootloader array, so the whole script tag cannot simply be JSON.parsed. Scanning for the
 * matching bracket is what makes the surrounding JavaScript irrelevant. Quotes and escapes
 * are tracked so that a `]` inside post text does not end the scan early.
 */
export function sliceBalancedJson(source: string, start: number): string | null {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < source.length; i++) {
        const char = source[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (char === '[' || char === '{') depth++;
        else if (char === ']' || char === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    return null;
}

/**
 * Pull every post object out of an HTML page's embedded payload, de-duplicated by id.
 *
 * Malformed slices are skipped rather than thrown: the page carries many `thread_items`
 * arrays (related posts, recommendations) and one unparseable block must not lose the rest.
 */
export function extractSsrPosts(html: string): SsrRawPost[] {
    const byId = new Map<string, SsrRawPost>();

    let searchFrom = 0;
    for (;;) {
        const keyAt = html.indexOf(THREAD_ITEMS_KEY, searchFrom);
        if (keyAt === -1) break;
        searchFrom = keyAt + THREAD_ITEMS_KEY.length;

        const arrayAt = html.indexOf('[', searchFrom);
        if (arrayAt === -1) break;

        const raw = sliceBalancedJson(html, arrayAt);
        if (!raw) continue;

        try {
            const items = JSON.parse(raw) as { post?: SsrRawPost }[];
            for (const item of items) {
                const post = item?.post;
                if (post?.pk) byId.set(post.pk, post);
            }
        } catch {
            // Not a post array (or truncated) — the next match may still be one.
        }
    }

    return [...byId.values()];
}

/** True when the response is Threads' soft-block page rather than a real one. */
export function isSoftBlocked(html: string): boolean {
    return html.includes(SOFT_BLOCK_MARKER);
}

function mediaUrlsOf(post: SsrRawPost): ThreadsMedia[] {
    const out: ThreadsMedia[] = [];
    const collect = (node: SsrRawPost) => {
        const video = node.video_versions?.[0]?.url;
        if (video) {
            out.push({ url: video, type: 'video' });
            return; // A video entry also carries a poster image; the video is the media.
        }
        const image = node.image_versions2?.candidates?.[0]?.url;
        if (image) out.push({ url: image, type: 'image' });
    };

    if (post.carousel_media?.length) post.carousel_media.forEach(collect);
    else collect(post);

    return out;
}

function mediaTypeOf(post: SsrRawPost, media: ThreadsMedia[]): MediaType {
    if (post.carousel_media?.length) return 'carousel';
    if (post.media_type === MEDIA_TYPE_VIDEO || media.some((m) => m.type === 'video')) return 'video';
    if (media.length) return 'photo';
    return 'text';
}

/**
 * Map one payload object onto the actor's output contract.
 *
 * `publishedAt` used to be whatever the DOM's relative label said ("2h", "09/04"); the
 * payload carries an exact unix timestamp, so both time fields now hold the same ISO value.
 * That is strictly more information than the label it replaces.
 */
export function mapSsrPost(
    raw: SsrRawPost,
    sourceType: SourceType,
    sourceQuery: string,
    scrapedAt: string = new Date().toISOString(),
): ThreadsPost {
    const author = raw.user?.username ?? '';
    const iso = raw.taken_at ? new Date(raw.taken_at * 1000).toISOString() : '';
    const media = mediaUrlsOf(raw);
    const info = raw.text_post_app_info ?? {};

    return {
        postId: raw.pk ?? '',
        author,
        content: raw.caption?.text ?? '',
        publishedAt: iso,
        publishedAtISO: iso,
        likeCount: raw.like_count ?? 0,
        replyCount: info.direct_reply_count ?? 0,
        repostCount: info.repost_count ?? 0,
        shareCount: info.reshare_count ?? 0,
        // Not published to logged-out clients; kept at 0 rather than guessed.
        viewCount: 0,
        quoteCount: info.quote_count ?? 0,
        mediaType: mediaTypeOf(raw, media),
        mediaUrls: media,
        postUrl: raw.canonical_url ?? (raw.code && author ? `https://www.threads.com/@${author}/post/${raw.code}` : ''),
        sourceType,
        sourceQuery,
        scrapedAt,
        // Replies live on the post page, which serves no payload — see the module note.
        replies: [],
    };
}

/**
 * Fetch a Threads URL until the response actually carries the payload.
 *
 * Each attempt uses a new proxy session on purpose: a flagged session keeps answering with
 * the soft-block page, so retrying on the same one is guaranteed to fail.
 */
export async function fetchSsrPosts(
    url: string,
    options: {
        sourceType: SourceType;
        sourceQuery: string;
        newProxyUrl?: () => Promise<string | undefined>;
        maxAttempts?: number;
        onAttempt?: (attempt: number, outcome: 'ok' | 'soft-blocked' | 'no-payload' | 'error') => void;
    },
): Promise<SsrFetchResult> {
    const maxAttempts = options.maxAttempts ?? 4;
    let lastFailure: SsrFetchResult['failure'] = 'no-payload';

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const proxyUrl = await options.newProxyUrl?.();
            const response = await gotScraping({ url, proxyUrl, timeout: { request: 30_000 } });
            const html = response.body;

            const raw = extractSsrPosts(html);
            if (raw.length > 0) {
                options.onAttempt?.(attempt, 'ok');
                return {
                    posts: raw.map((p) => mapSsrPost(p, options.sourceType, options.sourceQuery)),
                    attempts: attempt,
                };
            }

            lastFailure = isSoftBlocked(html) ? 'soft-blocked' : 'no-payload';
            options.onAttempt?.(attempt, lastFailure);
        } catch {
            options.onAttempt?.(attempt, 'error');
        }
    }

    return { posts: [], attempts: maxAttempts, failure: lastFailure };
}
