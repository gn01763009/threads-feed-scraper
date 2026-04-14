import type { Mode, NormalizedInput, RawInput, SearchSort } from './types.js';

const ABSOLUTE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_DATE_PATTERN = /^(\d+)\s*(day|days|week|weeks|month|months|year|years)$/i;
const USERNAME_PATTERN = /^@?[A-Za-z0-9._]{1,30}$/;
const VALID_SORTS: readonly SearchSort[] = ['top', 'recent'];
const VALID_MODES: readonly Mode[] = ['user', 'hashtag', 'search', 'post', 'feed'];

const DEFAULT_MAX_POSTS = 50;
const POSTS_PER_SCROLL = 10;
const MIN_SCROLL_COUNT = 3;
const MAX_SCROLL_COUNT = 20;
const MAX_BATCH_SIZE = 100;

export function validateInput(raw: RawInput | null | undefined): NormalizedInput {
    if (!raw) {
        throw new Error('Input is required');
    }

    const usernames = dedupe([
        ...cleanUsernames(raw.usernames),
        ...cleanUsernames(splitLines(raw.bulkUsernames)),
        ...cleanUsernames((raw.profileUrls ?? []).map(profileUrlToUsername)),
    ]);

    const keywords = dedupe([
        ...filterNonEmpty(raw.keywords),
        ...filterNonEmpty(splitLines(raw.bulkKeywords)),
        ...filterNonEmpty(raw.searchKeywords),
        ...filterNonEmpty(raw.searchTags),
    ]);

    const postUrls = filterNonEmpty(raw.postUrls);
    const feedUrls = filterNonEmpty(raw.feedUrls);

    if (usernames.length > MAX_BATCH_SIZE) {
        throw new Error(`usernames exceeds max batch size of ${MAX_BATCH_SIZE}`);
    }
    if (keywords.length > MAX_BATCH_SIZE) {
        throw new Error(`keywords exceeds max batch size of ${MAX_BATCH_SIZE}`);
    }

    for (const username of usernames) {
        if (!USERNAME_PATTERN.test(username)) {
            throw new Error(`Invalid username (letters, digits, dot, underscore, max 30 chars): "${username}"`);
        }
    }

    for (const url of feedUrls) assertThreadsHostname(url, 'feed');
    for (const url of postUrls) {
        assertThreadsHostname(url, 'post');
        const parsed = new URL(url);
        if (!parsed.pathname.includes('/post/')) {
            throw new Error(`Invalid post URL (must contain /post/): ${url}`);
        }
    }

    if (raw.mode !== undefined && !VALID_MODES.includes(raw.mode)) {
        throw new Error(`mode must be one of: ${VALID_MODES.join(', ')}`);
    }

    const mode = raw.mode ?? autoDetectMode({ usernames, keywords, postUrls, feedUrls, raw });

    assertModeHasInput(mode, { usernames, keywords, postUrls, feedUrls });

    if (raw.searchSort !== undefined && !VALID_SORTS.includes(raw.searchSort)) {
        throw new Error(`searchSort must be one of: ${VALID_SORTS.join(', ')}`);
    }

    const dateFrom = normalizeDate(raw.dateFrom, 'dateFrom');
    const dateTo = normalizeDate(raw.dateTo, 'dateTo');

    if (dateFrom && dateTo && dateFrom > dateTo) {
        throw new Error('dateFrom must be before dateTo');
    }

    const maxPosts = raw.maxPosts ?? DEFAULT_MAX_POSTS;
    const scrollCount = raw.scrollCount ?? autoScrollCount(maxPosts);

    return {
        mode,
        usernames,
        keywords,
        postUrls,
        feedUrls,
        searchSort: raw.searchSort,
        dateFrom,
        dateTo,
        maxPosts,
        scrollCount,
    };
}

function autoDetectMode(ctx: {
    usernames: string[];
    keywords: string[];
    postUrls: string[];
    feedUrls: string[];
    raw: RawInput;
}): Mode {
    if (ctx.postUrls.length > 0) return 'post';
    if (ctx.feedUrls.length > 0) return 'feed';
    if (ctx.usernames.length > 0) return 'user';
    if (ctx.raw.searchTags && ctx.raw.searchTags.length > 0) return 'hashtag';
    if (ctx.keywords.length > 0) return 'search';
    throw new Error(
        'Input is empty. Set "mode" and provide at least one of usernames, keywords, postUrls, or feedUrls.',
    );
}

function assertModeHasInput(
    mode: Mode,
    ctx: { usernames: string[]; keywords: string[]; postUrls: string[]; feedUrls: string[] },
): void {
    switch (mode) {
        case 'user':
            if (ctx.usernames.length === 0) throw new Error('mode "user" requires at least one username');
            break;
        case 'hashtag':
        case 'search':
            if (ctx.keywords.length === 0) throw new Error(`mode "${mode}" requires at least one keyword`);
            break;
        case 'post':
            if (ctx.postUrls.length === 0) throw new Error('mode "post" requires at least one postUrls entry');
            break;
        case 'feed':
            if (ctx.feedUrls.length === 0) throw new Error('mode "feed" requires at least one feedUrls entry');
            break;
        default: {
            const _exhaustive: never = mode;
            throw new Error(`Unhandled mode: ${_exhaustive as string}`);
        }
    }
}

export function normalizeDate(value: string | undefined, field: string): string | undefined {
    if (value === undefined || value.trim() === '') return undefined;
    const trimmed = value.trim();

    if (ABSOLUTE_DATE_PATTERN.test(trimmed)) return trimmed;

    const relative = trimmed.match(RELATIVE_DATE_PATTERN);
    if (relative) {
        const amount = Number(relative[1]);
        const unit = relative[2].toLowerCase();
        return subtractFromToday(amount, unit);
    }

    throw new Error(`${field} must be YYYY-MM-DD or a relative expression like "7 days", "1 month"`);
}

function autoScrollCount(maxPosts: number): number {
    const estimated = Math.ceil(maxPosts / POSTS_PER_SCROLL);
    return Math.min(MAX_SCROLL_COUNT, Math.max(MIN_SCROLL_COUNT, estimated));
}

function subtractFromToday(amount: number, unit: string): string {
    const d = new Date();
    if (unit.startsWith('day')) d.setUTCDate(d.getUTCDate() - amount);
    else if (unit.startsWith('week')) d.setUTCDate(d.getUTCDate() - amount * 7);
    else if (unit.startsWith('month')) d.setUTCMonth(d.getUTCMonth() - amount);
    else if (unit.startsWith('year')) d.setUTCFullYear(d.getUTCFullYear() - amount);
    return d.toISOString().slice(0, 10);
}

function assertThreadsHostname(url: string, label: string): void {
    try {
        const parsed = new URL(url);
        if (!['threads.com', 'www.threads.com'].includes(parsed.hostname)) {
            throw new Error(`Invalid ${label} URL (must be threads.com): ${url}`);
        }
    } catch (err) {
        if (err instanceof Error && err.message.startsWith('Invalid')) throw err;
        throw new Error(`Invalid ${label} URL: ${url}`);
    }
}

function profileUrlToUsername(url: string): string {
    try {
        const parsed = new URL(url);
        const match = parsed.pathname.match(/^\/@([^/]+)/);
        return match ? match[1] : url;
    } catch {
        return url;
    }
}

function cleanUsernames(values: readonly string[] | undefined): string[] {
    if (!values) return [];
    return values.map((v) => v.trim().replace(/^@/, '')).filter((v) => v.length > 0);
}

function splitLines(text: string | undefined): string[] {
    if (!text) return [];
    return text.split(/\r?\n/);
}

function filterNonEmpty(arr: readonly string[] | undefined): string[] {
    if (!arr) return [];
    return arr.map((s) => s.trim()).filter((s) => s.length > 0);
}

function dedupe(values: readonly string[]): string[] {
    return Array.from(new Set(values));
}
