import { describe, it, expect, beforeAll } from 'vitest';
import { setInput, clearDataset, runActor, getDatasetItems } from './e2e-helpers.js';

const REQUIRED_POST_FIELDS = [
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
    for (const field of REQUIRED_POST_FIELDS) {
        expect(post).toHaveProperty(field);
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

describe('E2E: Threads Scraper', { timeout: 120_000 }, () => {
    describe('search mode', () => {
        let items: Record<string, unknown>[] = [];

        beforeAll(() => {
            clearDataset();
            setInput({
                searchKeywords: ['AI'],
                maxPosts: 5,
                scrollCount: 2,
            });
            runActor();
            items = getDatasetItems();
        });

        it('extracts at least 1 post', () => {
            expect(items.length).toBeGreaterThanOrEqual(1);
        });

        it('each post has correct shape', () => {
            for (const item of items) {
                assertPostShape(item);
            }
        });

        it('sets sourceType to "search"', () => {
            for (const item of items) {
                expect(item.sourceType).toBe('search');
            }
        });

        it('sets sourceQuery to the keyword', () => {
            for (const item of items) {
                expect(item.sourceQuery).toBe('AI');
            }
        });
    });

    describe('tag mode', () => {
        let items: Record<string, unknown>[] = [];

        beforeAll(() => {
            clearDataset();
            setInput({
                searchTags: ['tech'],
                maxPosts: 5,
                scrollCount: 2,
            });
            runActor();
            items = getDatasetItems();
        });

        it('extracts at least 1 post', () => {
            expect(items.length).toBeGreaterThanOrEqual(1);
        });

        it('each post has correct shape', () => {
            for (const item of items) {
                assertPostShape(item);
            }
        });

        it('sets sourceType to "tag"', () => {
            for (const item of items) {
                expect(item.sourceType).toBe('tag');
            }
        });
    });

    describe('profile mode', () => {
        let items: Record<string, unknown>[] = [];

        beforeAll(() => {
            clearDataset();
            setInput({
                profileUrls: ['https://www.threads.com/@zuck'],
                maxPosts: 5,
                scrollCount: 2,
            });
            runActor();
            items = getDatasetItems();
        });

        it('extracts at least 1 post', () => {
            expect(items.length).toBeGreaterThanOrEqual(1);
        });

        it('each post has correct shape', () => {
            for (const item of items) {
                assertPostShape(item);
            }
        });

        it('sets sourceType to "profile"', () => {
            for (const item of items) {
                expect(item.sourceType).toBe('profile');
            }
        });
    });
});
