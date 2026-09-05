/**
 * Unit tests for the server-rendered payload parser.
 *
 * No network: the fixtures below are trimmed copies of what Threads actually embeds in a
 * profile page, so a change in that shape shows up here rather than as an empty run.
 */

import { describe, expect, it } from 'vitest';

import { extractSsrPosts, isSoftBlocked, mapSsrPost, sliceBalancedJson } from '../src/ssr.js';

/** One post, shaped like the real payload (fields the mapper reads, nothing else). */
const post = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
        post: {
            pk: '3977518562965884838',
            code: 'Dcy_A8pGo-m',
            taken_at: 1788377183,
            like_count: 1435,
            media_type: 1,
            caption: { text: 'Muse Spark 1.3 is rolling out today.' },
            user: { username: 'zuck' },
            image_versions2: { candidates: [{ url: 'https://cdn.example/photo.webp' }] },
            text_post_app_info: {
                direct_reply_count: 182,
                repost_count: 147,
                quote_count: 27,
                reshare_count: 9,
                is_reply: false,
            },
            ...over,
        },
    });

const pageWith = (...posts: string[]) =>
    `<html><body><script>requireLazy(["x"],function(){__d("y",[],["adp_Preloader",{"__bbox":{"result":{"data":{"mediaData":{"edges":[{"node":{"thread_items":[${posts.join(',')}]}}]}}}}}])})</script></body></html>`;

describe('sliceBalancedJson', () => {
    it('returns the whole balanced value', () => {
        expect(sliceBalancedJson('xx[1,[2,3]]yy', 2)).toBe('[1,[2,3]]');
    });

    it('ignores brackets inside strings — post text is full of them', () => {
        const src = '["a]b","c[d"]';
        expect(sliceBalancedJson(src, 0)).toBe(src);
    });

    it('ignores escaped quotes rather than ending the string early', () => {
        const src = '["he said \\"]\\" and left"]';
        expect(sliceBalancedJson(src, 0)).toBe(src);
    });

    it('returns null when the value never closes', () => {
        expect(sliceBalancedJson('[1,2', 0)).toBeNull();
    });
});

describe('extractSsrPosts', () => {
    it('pulls posts out of the embedded payload', () => {
        const posts = extractSsrPosts(pageWith(post()));
        expect(posts).toHaveLength(1);
        expect(posts[0].pk).toBe('3977518562965884838');
    });

    it('de-duplicates the same post appearing in several payload blocks', () => {
        const html = pageWith(post()) + pageWith(post());
        expect(extractSsrPosts(html)).toHaveLength(1);
    });

    it('keeps going when one block is unparseable', () => {
        const html = `<script>"thread_items":[{"post":{broken}]</script>` + pageWith(post());
        expect(extractSsrPosts(html)).toHaveLength(1);
    });

    it('returns nothing for the empty related-posts arrays a post page ships', () => {
        expect(extractSsrPosts('<script>"thread_items":[],"thread_type":"thread"</script>')).toEqual([]);
    });

    it('returns nothing for a page with no payload at all', () => {
        expect(extractSsrPosts('<html><body>Log in or sign up for Threads</body></html>')).toEqual([]);
    });
});

describe('isSoftBlocked', () => {
    it('detects the soft-block page, which is served as HTTP 200', () => {
        expect(isSoftBlocked('<div>Something went wrong, please try again later.</div>')).toBe(true);
    });

    it('does not flag a normal page', () => {
        expect(isSoftBlocked(pageWith(post()))).toBe(false);
    });
});

describe('mapSsrPost', () => {
    const raw = extractSsrPosts(pageWith(post()))[0];

    it('maps the engagement counts to their own fields', () => {
        const mapped = mapSsrPost(raw, 'profile', 'zuck', '2026-09-05T00:00:00.000Z');
        expect(mapped).toMatchObject({
            postId: '3977518562965884838',
            author: 'zuck',
            content: 'Muse Spark 1.3 is rolling out today.',
            likeCount: 1435,
            replyCount: 182,
            repostCount: 147,
            quoteCount: 27,
            shareCount: 9,
            sourceType: 'profile',
            sourceQuery: 'zuck',
            scrapedAt: '2026-09-05T00:00:00.000Z',
        });
    });

    it('turns the unix timestamp into an exact ISO time', () => {
        const mapped = mapSsrPost(raw, 'profile', 'zuck');
        expect(mapped.publishedAtISO).toBe(new Date(1788377183 * 1000).toISOString());
        expect(mapped.publishedAt).toBe(mapped.publishedAtISO);
    });

    it('builds the post URL from the author and short code', () => {
        expect(mapSsrPost(raw, 'profile', 'zuck').postUrl).toBe('https://www.threads.com/@zuck/post/Dcy_A8pGo-m');
    });

    it('prefers the canonical URL when the payload carries one', () => {
        const withCanonical = extractSsrPosts(pageWith(post({ canonical_url: 'https://www.threads.com/canonical' })))[0];
        expect(mapSsrPost(withCanonical, 'profile', 'zuck').postUrl).toBe('https://www.threads.com/canonical');
    });

    it('classifies a photo post', () => {
        const mapped = mapSsrPost(raw, 'profile', 'zuck');
        expect(mapped.mediaType).toBe('photo');
        expect(mapped.mediaUrls).toEqual([{ url: 'https://cdn.example/photo.webp', type: 'image' }]);
    });

    it('classifies a video post and prefers the video over its poster image', () => {
        const video = extractSsrPosts(
            pageWith(post({ media_type: 2, video_versions: [{ url: 'https://cdn.example/clip.mp4' }] })),
        )[0];
        const mapped = mapSsrPost(video, 'profile', 'zuck');
        expect(mapped.mediaType).toBe('video');
        expect(mapped.mediaUrls).toEqual([{ url: 'https://cdn.example/clip.mp4', type: 'video' }]);
    });

    it('classifies a carousel and keeps every slide', () => {
        const carousel = extractSsrPosts(
            pageWith(
                post({
                    carousel_media: [
                        { image_versions2: { candidates: [{ url: 'https://cdn.example/1.webp' }] } },
                        { video_versions: [{ url: 'https://cdn.example/2.mp4' }] },
                    ],
                }),
            ),
        )[0];
        const mapped = mapSsrPost(carousel, 'profile', 'zuck');
        expect(mapped.mediaType).toBe('carousel');
        expect(mapped.mediaUrls).toHaveLength(2);
    });

    it('classifies a text-only post', () => {
        const textOnly = extractSsrPosts(pageWith(post({ image_versions2: null })))[0];
        expect(mapSsrPost(textOnly, 'profile', 'zuck').mediaType).toBe('text');
    });

    it('defaults every count rather than emitting undefined', () => {
        const bare = extractSsrPosts(pageWith(post({ like_count: undefined, text_post_app_info: null })))[0];
        const mapped = mapSsrPost(bare, 'profile', 'zuck');
        expect(mapped).toMatchObject({ likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0, shareCount: 0 });
    });
});
