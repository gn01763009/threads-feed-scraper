import { describe, expect, it } from 'vitest';
import { mergeThreadChains } from '../src/threads.js';
import type { ThreadsPost } from '../src/types.js';

function makePost(overrides: Partial<ThreadsPost> = {}): ThreadsPost {
    return {
        postId: 'ABC123',
        author: 'testuser',
        content: 'test content',
        publishedAt: '2d',
        publishedAtISO: '2026-04-01T12:00:00.000Z',
        likeCount: 10,
        replyCount: 2,
        repostCount: 1,
        shareCount: 0,
        viewCount: 0,
        quoteCount: 0,
        mediaType: 'text',
        mediaUrls: [],
        postUrl: 'https://www.threads.com/@testuser/post/ABC123',
        sourceType: 'profile',
        sourceQuery: 'https://www.threads.com/@testuser',
        scrapedAt: '2026-04-03T12:00:00.000Z',
        replies: [],
        ...overrides,
    };
}

describe('mergeThreadChains', () => {
    it('returns empty array for empty input', () => {
        expect(mergeThreadChains([])).toEqual([]);
    });

    it('returns single post unchanged', () => {
        const post = makePost();
        const result = mergeThreadChains([post]);
        expect(result).toHaveLength(1);
        expect(result[0].threadParts).toBeUndefined();
    });

    it('does not merge posts with different authors', () => {
        const posts = [
            makePost({ postId: 'DWir0AAA', author: 'alice' }),
            makePost({ postId: 'DWir0BBB', author: 'bob' }),
        ];
        const result = mergeThreadChains(posts);
        expect(result).toHaveLength(2);
    });

    it('does not merge posts with different timestamps', () => {
        const posts = [
            makePost({ postId: 'DWir0AAA', publishedAtISO: '2026-04-01T00:00:00.000Z' }),
            makePost({ postId: 'DWir0BBB', publishedAtISO: '2026-04-02T00:00:00.000Z' }),
        ];
        const result = mergeThreadChains(posts);
        expect(result).toHaveLength(2);
    });

    it('does not merge posts with dissimilar postIds', () => {
        const posts = [makePost({ postId: 'DVsySGxE8Ng' }), makePost({ postId: 'DVtOIh3E9AV' })];
        const result = mergeThreadChains(posts);
        expect(result).toHaveLength(2);
    });

    it('merges a 2-part thread chain', () => {
        const posts = [
            makePost({
                postId: 'DWirzHvE7ke',
                content: 'Part 1 main content',
                likeCount: 304,
                replyCount: 49,
            }),
            makePost({
                postId: 'DWir0DWE9ht',
                content: 'Part 2 continuation',
                likeCount: 49,
                replyCount: 3,
            }),
        ];
        const result = mergeThreadChains(posts);

        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('Part 1 main content\n\nPart 2 continuation');
        expect(result[0].likeCount).toBe(353);
        expect(result[0].replyCount).toBe(52);
        expect(result[0].threadParts).toHaveLength(2);
        expect(result[0].threadParts![0].content).toBe('Part 1 main content');
    });

    it('merges a 4-part thread chain', () => {
        const posts = [
            makePost({ postId: 'DVp_mrOk1Xd', content: 'A', likeCount: 12000 }),
            makePost({ postId: 'DVp_nD_E7MF', content: 'B', likeCount: 100 }),
            makePost({ postId: 'DVp_noIE_G7', content: 'C', likeCount: 50 }),
            makePost({ postId: 'DVp_oKyEzIh', content: 'D', likeCount: 20 }),
        ];
        const result = mergeThreadChains(posts);

        expect(result).toHaveLength(1);
        expect(result[0].threadParts).toHaveLength(4);
        // Highest engagement first
        expect(result[0].threadParts![0].postId).toBe('DVp_mrOk1Xd');
        expect(result[0].likeCount).toBe(12170);
    });

    it('places highest-engagement post first in merged content', () => {
        const posts = [
            makePost({ postId: 'DWir0AAA', content: 'Low engagement', likeCount: 5 }),
            makePost({ postId: 'DWir0BBB', content: 'High engagement', likeCount: 500 }),
        ];
        const result = mergeThreadChains(posts);

        expect(result).toHaveLength(1);
        expect(result[0].content.startsWith('High engagement')).toBe(true);
        expect(result[0].postId).toBe('DWir0BBB');
    });

    it('keeps non-chain posts separate while merging chains', () => {
        const posts = [
            // Chain
            makePost({
                postId: 'DWir0AAA',
                content: 'Chain part 1',
                likeCount: 100,
                publishedAtISO: '2026-03-31T00:00:00.000Z',
            }),
            makePost({
                postId: 'DWir0BBB',
                content: 'Chain part 2',
                likeCount: 10,
                publishedAtISO: '2026-03-31T00:00:00.000Z',
            }),
            // Standalone
            makePost({
                postId: 'DXyz1234',
                content: 'Solo post',
                likeCount: 50,
                publishedAtISO: '2026-04-01T00:00:00.000Z',
            }),
        ];
        const result = mergeThreadChains(posts);

        expect(result).toHaveLength(2);
        const merged = result.find((p) => p.threadParts);
        const solo = result.find((p) => !p.threadParts);
        expect(merged?.threadParts).toHaveLength(2);
        expect(solo?.postId).toBe('DXyz1234');
    });

    it('merges media from all parts', () => {
        const posts = [
            makePost({
                postId: 'DWir0AAA',
                likeCount: 100,
                mediaUrls: [{ url: 'img1.jpg', type: 'image' }],
                mediaType: 'photo',
            }),
            makePost({
                postId: 'DWir0BBB',
                likeCount: 10,
                mediaUrls: [
                    { url: 'img2.jpg', type: 'image' },
                    { url: 'vid1.mp4', type: 'video' },
                ],
                mediaType: 'carousel',
            }),
        ];
        const result = mergeThreadChains(posts);

        expect(result).toHaveLength(1);
        expect(result[0].mediaUrls).toHaveLength(3);
        expect(result[0].mediaType).toBe('carousel');
    });

    it('handles timestamps within 10 seconds as matching', () => {
        const posts = [
            makePost({
                postId: 'DWir0AAA',
                publishedAtISO: '2026-04-01T12:00:00.000Z',
                likeCount: 100,
            }),
            makePost({
                postId: 'DWir0BBB',
                publishedAtISO: '2026-04-01T12:00:08.000Z',
                likeCount: 10,
            }),
        ];
        const result = mergeThreadChains(posts);
        expect(result).toHaveLength(1);
    });

    it('does not merge timestamps more than 10 seconds apart', () => {
        const posts = [
            makePost({
                postId: 'DWir0AAA',
                publishedAtISO: '2026-04-01T12:00:00.000Z',
            }),
            makePost({
                postId: 'DWir0BBB',
                publishedAtISO: '2026-04-01T12:00:15.000Z',
            }),
        ];
        const result = mergeThreadChains(posts);
        expect(result).toHaveLength(2);
    });
});
