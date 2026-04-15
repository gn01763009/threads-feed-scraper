/**
 * E2E tests — runs `apify run` locally against real Threads.
 *
 * Each describe block corresponds to a test-inputs/0N-*.json fixture and
 * covers one runtime mode. All modes share the same actor code regardless
 * of locale; locale directories only affect listing metadata.
 *
 * Run with: npm run test:e2e
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { clearDataset, getDatasetItems, runActor, setInput } from './e2e-helpers.js';

const ROOT = join(import.meta.dirname, '..');

function fixture(name: string): Record<string, unknown> {
    return JSON.parse(
        readFileSync(join(ROOT, 'test-inputs', name), 'utf-8'),
    ) as Record<string, unknown>;
}

// Fields every post record must carry
const REQUIRED_FIELDS = [
    'postId',
    'author',
    'content',
    'publishedAt',
    'publishedAtISO',
    'likeCount',
    'replyCount',
    'repostCount',
    'shareCount',
    'viewCount',
    'quoteCount',
    'mediaType',
    'mediaUrls',
    'postUrl',
    'sourceType',
    'sourceQuery',
    'scrapedAt',
    'replies',
] as const;

function assertPostShape(post: Record<string, unknown>): void {
    for (const field of REQUIRED_FIELDS) {
        expect(post, `missing field: ${field}`).toHaveProperty(field);
    }
    expect(typeof post.postId).toBe('string');
    expect(typeof post.author).toBe('string');
    expect(typeof post.content).toBe('string');
    expect(typeof post.likeCount).toBe('number');
    expect(typeof post.replyCount).toBe('number');
    expect(typeof post.repostCount).toBe('number');
    expect(typeof post.shareCount).toBe('number');
    expect(typeof post.viewCount).toBe('number');
    expect(typeof post.quoteCount).toBe('number');
    expect(['text', 'photo', 'video', 'carousel']).toContain(post.mediaType);
    expect(Array.isArray(post.mediaUrls)).toBe(true);
    expect(Array.isArray(post.replies)).toBe(true);
    expect(typeof post.postUrl).toBe('string');
    expect(typeof post.scrapedAt).toBe('string');
}

// ─── 01: User mode ──────────────────────────────────────────────────────────

describe('E2E 01 — user mode (fixture 01-user.json)', { timeout: 180_000 }, () => {
    let items: Record<string, unknown>[] = [];

    beforeAll(() => {
        clearDataset();
        setInput(fixture('01-user.json'));
        runActor();
        items = getDatasetItems();
    });

    it('extracts at least 1 post', () => {
        expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('every post has required shape', () => {
        for (const item of items) assertPostShape(item);
    });

    it('sourceType is "profile"', () => {
        for (const item of items) expect(item.sourceType).toBe('profile');
    });

    it('bulkUsernames merged — all three authors present', () => {
        const authors = new Set(items.map(i => i.author));
        // fixture has zuck + bulkUsernames: mosseri\nfinkd
        const expected = ['zuck', 'mosseri', 'finkd'];
        for (const name of expected) {
            expect(authors, `missing author: ${name}`).toContain(name);
        }
    });
});

// ─── 02: Hashtag mode ───────────────────────────────────────────────────────

describe('E2E 02 — hashtag mode (fixture 02-hashtag.json)', { timeout: 180_000 }, () => {
    let items: Record<string, unknown>[] = [];

    beforeAll(() => {
        clearDataset();
        setInput(fixture('02-hashtag.json'));
        runActor();
        items = getDatasetItems();
    });

    it('extracts at least 1 post', () => {
        expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('every post has required shape', () => {
        for (const item of items) assertPostShape(item);
    });

    it('sourceType is "tag"', () => {
        for (const item of items) expect(item.sourceType).toBe('tag');
    });
});

// ─── 03: Search mode with relative date ─────────────────────────────────────

describe('E2E 03 — search mode + relative date (fixture 03-search-relative-date.json)', { timeout: 180_000 }, () => {
    let items: Record<string, unknown>[] = [];

    beforeAll(() => {
        clearDataset();
        setInput(fixture('03-search-relative-date.json'));
        runActor();
        items = getDatasetItems();
    });

    it('extracts at least 1 post', () => {
        expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('every post has required shape', () => {
        for (const item of items) assertPostShape(item);
    });

    it('sourceType is "search"', () => {
        for (const item of items) expect(item.sourceType).toBe('search');
    });

    it('publishedAtISO is within the last 7 days', () => {
        const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
        for (const item of items) {
            const ts = new Date(item.publishedAtISO as string).getTime();
            expect(ts).toBeGreaterThan(cutoff);
        }
    });
});

// ─── 04: Feed mode ──────────────────────────────────────────────────────────

describe('E2E 04 — feed mode (fixture 04-feed.json)', { timeout: 180_000 }, () => {
    let items: Record<string, unknown>[] = [];

    beforeAll(() => {
        clearDataset();
        setInput(fixture('04-feed.json'));
        runActor();
        items = getDatasetItems();
    });

    it('extracts at least 1 post', () => {
        expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('every post has required shape', () => {
        for (const item of items) assertPostShape(item);
    });

    it('sourceType is "feed"', () => {
        for (const item of items) expect(item.sourceType).toBe('feed');
    });
});

// ─── 05: Legacy backcompat ──────────────────────────────────────────────────

describe('E2E 05 — legacy v0.3 input (fixture 05-legacy-backcompat.json)', { timeout: 180_000 }, () => {
    let items: Record<string, unknown>[] = [];

    beforeAll(() => {
        clearDataset();
        setInput(fixture('05-legacy-backcompat.json'));
        runActor();
        items = getDatasetItems();
    });

    it('extracts at least 1 post', () => {
        expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('every post has required shape (backcompat did not break schema)', () => {
        for (const item of items) assertPostShape(item);
    });

    it('profileUrls field auto-migrated (sourceType is "profile" or "search")', () => {
        const valid = new Set(['profile', 'search', 'tag']);
        for (const item of items) {
            expect(valid).toContain(item.sourceType);
        }
    });
});

// ─── 06: Post mode + replies ────────────────────────────────────────────────

describe('E2E 06 — post mode + replies (fixture 06-post.json)', { timeout: 180_000 }, () => {
    let items: Record<string, unknown>[] = [];

    beforeAll(() => {
        clearDataset();
        setInput(fixture('06-post.json'));
        runActor();
        items = getDatasetItems();
    });

    it('extracts at least 1 post', () => {
        expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('every post has required shape', () => {
        for (const item of items) assertPostShape(item);
    });

    it('sourceType is "post"', () => {
        for (const item of items) expect(item.sourceType).toBe('post');
    });

    it('replies array is populated', () => {
        // post mode is the only one that fetches replies
        const withReplies = items.filter(
            i => Array.isArray(i.replies) && (i.replies as unknown[]).length > 0,
        );
        expect(withReplies.length).toBeGreaterThanOrEqual(1);
    });
});
