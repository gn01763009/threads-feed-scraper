/**
 * Post extraction via Threads' public embed endpoint.
 *
 * `post` mode used to read the rendered page. That stopped working on 2026-09-05 when
 * Threads put logged-out views behind a login wall, and unlike a profile the post page
 * carries no server-rendered payload either — its `thread_items` arrays come back empty.
 *
 * What still works is the endpoint Threads publishes for embedding a post on other sites:
 * `{postUrl}/embed` returns a small (~50 KB) self-contained HTML card with the author,
 * the full text, the timestamp, the four engagement counts and the media. No browser, no
 * login, no account. Verified 2026-09-05 against three real posts.
 *
 * Two things this path cannot recover, and they are real losses rather than details:
 *   1. **Replies.** The card is one post; the old DOM scraper walked the reply list.
 *   2. **Exact counts above 999.** The card renders "1.4K" where the payload said 1435.
 *      Below 1000 it is exact (a post with 474 likes renders "474"). The parser expands
 *      the abbreviation, so the number is right to two significant figures and no more —
 *      callers that need exact popularity should read the author's profile instead, where
 *      the SSR payload still carries `like_count`.
 * Both are surfaced in the input schema rather than left for a customer to discover.
 */

import { gotScraping } from 'got-scraping';

import type { MediaType, ThreadsMedia, ThreadsPost } from './types.js';

/** The card renders every timestamp in US Pacific, regardless of where the request comes
 * from — verified by fetching the same post through US, DE and JP exits and getting the
 * same "12:26 PM · Sep 2, 2026" each time (the payload's own `taken_at` for that post is
 * 19:26 UTC, i.e. PDT). So the zone is a constant, not a guess about the viewer. */
const EMBED_TIME_ZONE = 'America/Los_Angeles';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Threads serves a card for a deleted/private post too — this is what it says. */
const UNAVAILABLE_MARKER = 'Thread not available';

const stripTags = (html: string): string =>
    html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .trim();

const firstMatch = (html: string, re: RegExp): string | null => html.match(re)?.[1] ?? null;

/**
 * Expand the card's abbreviated counts. "1.4K" → 1400, "2M" → 2000000, "474" → 474.
 *
 * The precision loss is inherent to the source, not to this function: the card simply does
 * not contain the exact number. Returning 1400 for 1435 is honest rounding; returning 0 or
 * dropping the field would be worse for anyone ranking posts by engagement.
 */
export function parseAbbreviatedCount(raw: string | null | undefined): number {
    if (!raw) return 0;
    const m = raw.trim().replace(/,/g, '').match(/^([\d.]+)\s*([KM])?$/i);
    if (!m) return 0;
    const value = Number(m[1]);
    if (!Number.isFinite(value)) return 0;
    const suffix = m[2]?.toUpperCase();
    const SCALES: Record<string, number> = { K: 1_000, M: 1_000_000 };
    return Math.round(value * (suffix ? (SCALES[suffix] ?? 1) : 1));
}

/** Offset in minutes between UTC and `timeZone` at that instant (positive = behind UTC). */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).formatToParts(instant);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
    return (instant.getTime() - asUtc) / 60_000;
}

/**
 * "12:26 PM · Sep 2, 2026" → ISO instant.
 *
 * The offset is resolved for that specific date rather than hard-coded, so a post from
 * January (PST, UTC-8) converts as correctly as one from September (PDT, UTC-7). The second
 * pass catches the case where the first guess landed on the other side of a DST boundary.
 */
export function parseEmbedTimestamp(raw: string | null | undefined): string {
    if (!raw) return '';
    const m = raw.match(/(\d{1,2}):(\d{2})\s*([AP]M)\s*·\s*(\w{3})\s+(\d{1,2}),\s*(\d{4})/i);
    if (!m) return '';
    const monthIndex = MONTHS.findIndex((mo) => mo.toLowerCase() === m[4].toLowerCase());
    if (monthIndex === -1) return '';

    let hour = Number(m[1]) % 12;
    if (m[3].toUpperCase() === 'PM') hour += 12;
    const wallClockAsUtc = Date.UTC(Number(m[6]), monthIndex, Number(m[5]), hour, Number(m[2]));

    let instant = new Date(wallClockAsUtc + zoneOffsetMinutes(new Date(wallClockAsUtc), EMBED_TIME_ZONE) * 60_000);
    instant = new Date(wallClockAsUtc + zoneOffsetMinutes(instant, EMBED_TIME_ZONE) * 60_000);
    return Number.isNaN(instant.getTime()) ? '' : instant.toISOString();
}

/** The card shows the avatar and the post media as plain `<img>`; only the latter sits
 * inside a media container, which is what separates them. */
function mediaOf(html: string): ThreadsMedia[] {
    const containers = html.match(/class="(?:SoloMediaContainer|MultiMediaContainer|SingleInnerMediaContainer)"[\s\S]*?<\/div>/g) ?? [];
    const urls = new Set<string>();
    for (const container of containers) {
        for (const m of container.matchAll(/<img[^>]+src="([^"]+)"/g)) urls.add(m[1].replace(/&amp;/g, '&'));
    }
    return [...urls].map((url) => ({ url, type: 'image' as const }));
}

const mediaTypeOf = (media: ThreadsMedia[]): MediaType => {
    if (media.length > 1) return 'carousel';
    if (media.length === 1) return 'photo';
    return 'text';
};

/**
 * Split a card into one segment per post.
 *
 * A card is not always one post: asking for a post that sits inside a self-thread returns
 * the whole chain — ancestors first, the requested post last. Reading the first block, as
 * the obvious implementation does, silently attributes the *ancestor's* text and counts to
 * the URL you asked for. That is worse than returning nothing, and unit tests on a
 * single-post fixture cannot see it; it took an end-to-end run against a real chain
 * (@zuck/post/DcwLjJ9miE3 → 2 blocks, counts 1.3K/175/139/90 then 474/36/39/4) to surface.
 */
function splitPostBlocks(html: string): string[] {
    const starts = [...html.matchAll(/class="AuthorIdentity"/g)].map((m) => m.index ?? 0);
    if (starts.length === 0) return [];
    return starts.map((start, i) => html.slice(start, starts[i + 1] ?? html.length));
}

/**
 * Parse one embed card. Returns null when the card says the post is gone — that is a real
 * answer ("this URL has no post"), not a parse failure, so callers should not retry it.
 */
export function parseEmbedPost(html: string, postUrl: string, scrapedAt: string = new Date().toISOString()): ThreadsPost | null {
    if (html.includes(UNAVAILABLE_MARKER)) return null;

    const blocks = splitPostBlocks(html);
    // The URL points at the last post in the chain; anything before it is context.
    const block = blocks[blocks.length - 1] ?? html;

    const author = stripTags(firstMatch(block, /class="AuthorIdentity"[^>]*>([\s\S]*?)<\/div>/) ?? '');
    const content = stripTags(firstMatch(block, /class="BodyTextContainer"[^>]*>([\s\S]*?)<\/div>/) ?? '');
    const timestamp = stripTags(firstMatch(block, /class="Timestamp"[^>]*>([\s\S]*?)</) ?? '');
    if (!author && !content) return null;

    const counts = [...block.matchAll(/class="ActionBarCount"[^>]*>([\s\S]*?)</g)].map((m) => stripTags(m[1]));
    const iso = parseEmbedTimestamp(timestamp);
    const media = mediaOf(block);

    // Earlier blocks are the thread this post is replying to — kept rather than dropped,
    // because "what was this a reply to" is most of why a chain post is worth reading.
    const threadParts = blocks.slice(0, -1).map((part) => ({
        postId: '',
        content: stripTags(firstMatch(part, /class="BodyTextContainer"[^>]*>([\s\S]*?)<\/div>/) ?? ''),
        postUrl: '',
        mediaUrls: mediaOf(part),
    }));

    return {
        // The card carries no numeric id; the short code from the URL is the stable
        // identifier the rest of Threads uses in links.
        postId: postUrl.match(/\/post\/([A-Za-z0-9_-]+)/)?.[1] ?? '',
        author,
        content,
        publishedAt: iso,
        publishedAtISO: iso,
        likeCount: parseAbbreviatedCount(counts[0]),
        replyCount: parseAbbreviatedCount(counts[1]),
        repostCount: parseAbbreviatedCount(counts[2]),
        shareCount: parseAbbreviatedCount(counts[3]),
        viewCount: 0,
        quoteCount: 0,
        mediaType: mediaTypeOf(media),
        mediaUrls: media,
        postUrl,
        sourceType: 'post',
        sourceQuery: postUrl,
        scrapedAt,
        // The card carries no replies — those live on the post page, which serves nothing.
        replies: [],
        ...(threadParts.length > 0 ? { threadParts } : {}),
    };
}

export interface EmbedFetchResult {
    post: ThreadsPost | null;
    attempts: number;
    failure?: 'unavailable' | 'soft-blocked';
}

/**
 * Fetch and parse one post's embed card, retrying on the soft-block page with a fresh proxy
 * session each time — a flagged session keeps serving the block, so reusing one never
 * recovers (the same lesson as the profile path in src/ssr.ts).
 */
export async function fetchEmbedPost(
    postUrl: string,
    options: { newProxyUrl?: () => Promise<string | undefined>; maxAttempts?: number },
): Promise<EmbedFetchResult> {
    const maxAttempts = options.maxAttempts ?? 4;
    const url = `${postUrl.replace(/\/+$/, '')}/embed`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const proxyUrl = await options.newProxyUrl?.();
            const response = await gotScraping({ url, proxyUrl, timeout: { request: 30_000 }, throwHttpErrors: false });
            const html = response.body;

            if (html.includes(UNAVAILABLE_MARKER)) return { post: null, attempts: attempt, failure: 'unavailable' };

            const post = parseEmbedPost(html, postUrl);
            if (post) return { post, attempts: attempt };
        } catch {
            // Network error — a different session may do better.
        }
    }
    return { post: null, attempts: maxAttempts, failure: 'soft-blocked' };
}
