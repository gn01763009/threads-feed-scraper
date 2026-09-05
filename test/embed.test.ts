/**
 * Unit tests for the embed-card parser.
 *
 * The fixture mirrors the real card's structure (class names and nesting taken from a live
 * fetch of @zuck/post/Dcy_A8pGo-m on 2026-09-05), trimmed to what the parser reads. If
 * Threads renames those classes, these fail — which is the point: the previous breakage
 * was silent because nothing asserted on the markup.
 */

import { describe, expect, it } from 'vitest';

import { parseAbbreviatedCount, parseEmbedPost, parseEmbedTimestamp } from '../src/embed.js';

const POST_URL = 'https://www.threads.com/@zuck/post/Dcy_A8pGo-m';

const card = (over: { author?: string; body?: string; time?: string; counts?: string[]; media?: string[] } = {}) => {
    const counts = over.counts ?? ['1.4K', '182', '174', '76'];
    const media = over.media ?? ['https://cdn.example/post.webp'];
    return `<html><body><div class="Embed">
    <div class="AvatarContainer"><img class="img" src="https://cdn.example/avatar.webp"/></div>
    <div class="AuthorIdentity">${over.author ?? 'zuck'}</div>
    <div class="BodyTextContainer"><span>${over.body ?? "Muse Spark 1.3 is rolling out today. We've shipped it."}</span></div>
    <div class="SoloMediaContainer">${media.map((m) => `<img class="img" src="${m}"/>`).join('')}</div>
    <div class="ActionBarContainer">${counts.map((c) => `<div class="ActionBarCount">${c}</div>`).join('')}</div>
    <div class="Timestamp">${over.time ?? '12:26 PM · Sep 2, 2026'}</div>
    </div></body></html>`;
};

describe('parseAbbreviatedCount', () => {
    it('keeps exact numbers exact — the card only abbreviates above 999', () => {
        expect(parseAbbreviatedCount('474')).toBe(474);
        expect(parseAbbreviatedCount('0')).toBe(0);
        expect(parseAbbreviatedCount('1,234')).toBe(1234);
    });

    it('expands the abbreviations the card does use', () => {
        expect(parseAbbreviatedCount('1.4K')).toBe(1400);
        expect(parseAbbreviatedCount('2M')).toBe(2_000_000);
        expect(parseAbbreviatedCount('1.25M')).toBe(1_250_000);
    });

    it('returns 0 rather than NaN for anything unparseable', () => {
        for (const bad of ['', '  ', 'lots', null, undefined]) expect(parseAbbreviatedCount(bad)).toBe(0);
    });
});

describe('parseEmbedTimestamp', () => {
    it('converts the card time (US Pacific) to the same instant the payload reports', () => {
        // The payload's taken_at for this post is 1788377183 → 2026-09-02T19:26:23Z. The card
        // has no seconds, so minute precision is the most it can give.
        expect(parseEmbedTimestamp('12:26 PM · Sep 2, 2026')).toBe('2026-09-02T19:26:00.000Z');
    });

    it('resolves the offset per date instead of hard-coding it (PST in winter, PDT in summer)', () => {
        expect(parseEmbedTimestamp('12:00 PM · Jan 15, 2026')).toBe('2026-01-15T20:00:00.000Z'); // UTC-8
        expect(parseEmbedTimestamp('12:00 PM · Jul 15, 2026')).toBe('2026-07-15T19:00:00.000Z'); // UTC-7
    });

    it('handles midnight and noon, where 12-hour clocks usually break', () => {
        expect(parseEmbedTimestamp('12:00 AM · Sep 2, 2026')).toBe('2026-09-02T07:00:00.000Z');
        expect(parseEmbedTimestamp('12:59 PM · Sep 2, 2026')).toBe('2026-09-02T19:59:00.000Z');
    });

    it('returns empty string for anything it cannot read', () => {
        for (const bad of ['', 'yesterday', '25:00 XX · Foo 99, 2026', null]) expect(parseEmbedTimestamp(bad)).toBe('');
    });
});

describe('parseEmbedPost', () => {
    it('maps every field the card carries', () => {
        const post = parseEmbedPost(card(), POST_URL, '2026-09-05T00:00:00.000Z');
        expect(post).toMatchObject({
            postId: 'Dcy_A8pGo-m',
            author: 'zuck',
            likeCount: 1400,
            replyCount: 182,
            repostCount: 174,
            shareCount: 76,
            publishedAtISO: '2026-09-02T19:26:00.000Z',
            postUrl: POST_URL,
            sourceType: 'post',
            scrapedAt: '2026-09-05T00:00:00.000Z',
        });
        expect(post?.content).toContain('Muse Spark 1.3');
    });

    it('unescapes the entities the card encodes — apostrophes are everywhere in post text', () => {
        const post = parseEmbedPost(card({ body: "we&#039;ve shipped &amp; tested it" }), POST_URL);
        expect(post?.content).toBe("we've shipped & tested it");
    });

    it('takes the post media and leaves the avatar out', () => {
        const post = parseEmbedPost(card(), POST_URL);
        expect(post?.mediaUrls).toEqual([{ url: 'https://cdn.example/post.webp', type: 'image' }]);
        expect(post?.mediaType).toBe('photo');
    });

    it('classifies a text-only post and a multi-image one', () => {
        const textOnly = card({ media: [] }).replace('<div class="SoloMediaContainer"></div>', '');
        expect(parseEmbedPost(textOnly, POST_URL)?.mediaType).toBe('text');

        const carousel = card({ media: ['https://cdn.example/1.webp', 'https://cdn.example/2.webp'] });
        expect(parseEmbedPost(carousel, POST_URL)?.mediaType).toBe('carousel');
    });

    it('returns null for a deleted/private post rather than an empty husk', () => {
        expect(parseEmbedPost('<html><body>Thread not available</body></html>', POST_URL)).toBeNull();
    });

    it('returns null when the markup carries neither author nor text (renamed classes)', () => {
        expect(parseEmbedPost('<html><body><div class="Something">hi</div></body></html>', POST_URL)).toBeNull();
    });

    it('never emits undefined counts, even when the action bar is empty', () => {
        const post = parseEmbedPost(card({ counts: [] }), POST_URL);
        expect(post).toMatchObject({ likeCount: 0, replyCount: 0, repostCount: 0, shareCount: 0 });
    });

    it('fills the missing counts when the card shows fewer than four', () => {
        const post = parseEmbedPost(card({ counts: ['12', '3'] }), POST_URL);
        expect(post).toMatchObject({ likeCount: 12, replyCount: 3, repostCount: 0, shareCount: 0 });
    });

    // The bug this file exists to prevent: a chain card has several blocks and the caller
    // asked for the LAST one. Taking the first returns the ancestor's text and counts under
    // the requested URL — wrong data, which beats no data only in the worst sense.
    it('picks the requested post, not the ancestor, when the card is a thread chain', () => {
        const chain = card({ author: 'zuck', body: 'Muse Voice Transcribe is first', counts: ['1.3K', '175', '139', '90'] })
            .replace('</div></body></html>', '') +
            `<div class="AuthorIdentity">zuck</div>
             <div class="BodyTextContainer"><span>The model decides when to listen.</span></div>
             <div class="ActionBarContainer">${['474', '36', '39', '4'].map((c) => `<div class="ActionBarCount">${c}</div>`).join('')}</div>
             <div class="Timestamp">10:18 AM · Sep 1, 2026</div></div></body></html>`;

        const post = parseEmbedPost(chain, POST_URL);
        expect(post?.content).toBe('The model decides when to listen.');
        expect(post?.likeCount).toBe(474);
        expect(post?.replyCount).toBe(36);
    });

    it('keeps the earlier chain posts as context rather than dropping them', () => {
        const chain = card({ body: 'ancestor post' }).replace('</div></body></html>', '') +
            `<div class="AuthorIdentity">zuck</div>
             <div class="BodyTextContainer"><span>the reply</span></div>
             <div class="Timestamp">10:18 AM · Sep 1, 2026</div></div></body></html>`;
        const post = parseEmbedPost(chain, POST_URL);
        expect(post?.content).toBe('the reply');
        expect(post?.threadParts).toHaveLength(1);
        expect(post?.threadParts?.[0].content).toBe('ancestor post');
    });
});
