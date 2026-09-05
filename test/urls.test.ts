import { describe, expect, it } from 'vitest';
import { buildSearchUrl, buildTagUrl, buildProfileUrl, buildPostUrl } from '../src/urls.js';

describe('buildSearchUrl', () => {
    it('builds basic search URL', () => {
        const url = buildSearchUrl('AI news');
        expect(url).toBe('https://www.threads.com/search?q=AI+news&serp_type=default');
    });

    it('builds search URL with top sort', () => {
        const url = buildSearchUrl('AI news', 'top');
        expect(url).toBe('https://www.threads.com/search?q=AI+news&serp_type=default');
    });

    // "Recent" is its own serp_type. The previous `filter=recent` returned a page but repeated
    // 8 of 15 posts from the default tab, i.e. the sort was being ignored; serp_type=recent
    // returns a set with zero overlap. Measured 2026-09-06.
    it('builds search URL with recent sort', () => {
        const url = buildSearchUrl('AI news', 'recent');
        expect(url).toBe('https://www.threads.com/search?q=AI+news&serp_type=recent');
    });

    it('recent and top are different URLs — a sort that changes nothing is the bug this pins', () => {
        expect(buildSearchUrl('AI news', 'recent')).not.toBe(buildSearchUrl('AI news', 'top'));
    });

    it('handles Chinese characters', () => {
        const url = buildSearchUrl('寵物醫療');
        expect(url).toContain('q=');
        expect(decodeURIComponent(url)).toContain('寵物醫療');
    });
});

describe('buildTagUrl', () => {
    it('builds tag URL without hash prefix', () => {
        const url = buildTagUrl('tech');
        expect(url).toBe('https://www.threads.com/search?q=tech&serp_type=tags');
    });

    it('strips leading # from tag', () => {
        const url = buildTagUrl('#petfriendly');
        expect(url).toBe('https://www.threads.com/search?q=petfriendly&serp_type=tags');
    });
});

describe('buildProfileUrl', () => {
    it('builds profile URL from username', () => {
        const url = buildProfileUrl('zuck');
        expect(url).toBe('https://www.threads.com/@zuck');
    });

    it('strips leading @ from username', () => {
        const url = buildProfileUrl('@zuck');
        expect(url).toBe('https://www.threads.com/@zuck');
    });
});

describe('buildPostUrl', () => {
    it('returns full post URL as-is', () => {
        const url = buildPostUrl('https://www.threads.com/@user/post/ABC123');
        expect(url).toBe('https://www.threads.com/@user/post/ABC123');
    });
});
