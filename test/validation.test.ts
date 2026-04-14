import { describe, expect, it } from 'vitest';
import { validateInput, normalizeDate } from '../src/validation.js';

describe('validateInput — mode + canonical fields', () => {
    it('throws on null input', () => {
        expect(() => validateInput(null)).toThrow('Input is required');
    });

    it('throws when no source provided', () => {
        expect(() => validateInput({})).toThrow('Input is empty');
    });

    it('accepts user mode with usernames', () => {
        const r = validateInput({ mode: 'user', usernames: ['zuck', 'mosseri'] });
        expect(r.mode).toBe('user');
        expect(r.usernames).toEqual(['zuck', 'mosseri']);
    });

    it('strips leading @ from usernames', () => {
        const r = validateInput({ mode: 'user', usernames: ['@zuck'] });
        expect(r.usernames).toEqual(['zuck']);
    });

    it('rejects invalid username characters', () => {
        expect(() => validateInput({ mode: 'user', usernames: ['bad user!'] })).toThrow('Invalid username');
    });

    it('merges bulkUsernames textarea into usernames and dedupes', () => {
        const r = validateInput({
            mode: 'user',
            usernames: ['zuck'],
            bulkUsernames: 'zuck\nmosseri\n\n  finkd  ',
        });
        expect(r.usernames).toEqual(['zuck', 'mosseri', 'finkd']);
    });

    it('enforces 100-item batch limit on usernames', () => {
        const many = Array.from({ length: 101 }, (_, i) => `user${i}`);
        expect(() => validateInput({ mode: 'user', usernames: many })).toThrow('max batch size');
    });

    it('accepts search mode with keywords', () => {
        const r = validateInput({ mode: 'search', keywords: ['AI news'] });
        expect(r.mode).toBe('search');
        expect(r.keywords).toEqual(['AI news']);
    });

    it('accepts hashtag mode with keywords', () => {
        const r = validateInput({ mode: 'hashtag', keywords: ['#tech'] });
        expect(r.mode).toBe('hashtag');
        expect(r.keywords).toEqual(['#tech']);
    });

    it('merges bulkKeywords into keywords', () => {
        const r = validateInput({ mode: 'search', keywords: ['AI'], bulkKeywords: 'LLM\nagents' });
        expect(r.keywords).toEqual(['AI', 'LLM', 'agents']);
    });

    it('rejects user mode with no usernames', () => {
        expect(() => validateInput({ mode: 'user', keywords: ['AI'] })).toThrow('mode "user" requires');
    });

    it('rejects search mode with no keywords', () => {
        expect(() => validateInput({ mode: 'search', usernames: ['zuck'] })).toThrow('mode "search" requires');
    });

    it('rejects unknown mode', () => {
        expect(() => validateInput({ mode: 'bogus' as never, keywords: ['AI'] })).toThrow('mode must be one of');
    });
});

describe('validateInput — auto-detect + legacy backcompat', () => {
    it('auto-detects user mode from usernames when mode omitted', () => {
        const r = validateInput({ usernames: ['zuck'] });
        expect(r.mode).toBe('user');
    });

    it('auto-detects search mode from keywords when mode omitted', () => {
        const r = validateInput({ keywords: ['AI'] });
        expect(r.mode).toBe('search');
    });

    it('auto-detects hashtag mode from legacy searchTags', () => {
        const r = validateInput({ searchTags: ['#tech'] });
        expect(r.mode).toBe('hashtag');
        expect(r.keywords).toEqual(['#tech']);
    });

    it('migrates legacy searchKeywords into keywords', () => {
        const r = validateInput({ searchKeywords: ['AI news'] });
        expect(r.keywords).toEqual(['AI news']);
        expect(r.mode).toBe('search');
    });

    it('migrates legacy profileUrls into usernames', () => {
        const r = validateInput({ profileUrls: ['https://www.threads.com/@zuck'] });
        expect(r.usernames).toEqual(['zuck']);
        expect(r.mode).toBe('user');
    });
});

describe('validateInput — URLs', () => {
    it('accepts valid feedUrls', () => {
        const r = validateInput({
            mode: 'feed',
            feedUrls: ['https://www.threads.com/custom_feed/123'],
        });
        expect(r.feedUrls).toEqual(['https://www.threads.com/custom_feed/123']);
    });

    it('rejects invalid feed URL hostname', () => {
        expect(() =>
            validateInput({ mode: 'feed', feedUrls: ['https://example.com/feed'] }),
        ).toThrow('Invalid feed URL');
    });

    it('accepts valid postUrls', () => {
        const r = validateInput({
            mode: 'post',
            postUrls: ['https://www.threads.com/@user/post/ABC123'],
        });
        expect(r.postUrls).toEqual(['https://www.threads.com/@user/post/ABC123']);
    });

    it('rejects postUrl without /post/ path', () => {
        expect(() =>
            validateInput({ mode: 'post', postUrls: ['https://www.threads.com/@user'] }),
        ).toThrow('Invalid post URL');
    });
});

describe('validateInput — searchSort + dates', () => {
    it('accepts valid searchSort "recent"', () => {
        const r = validateInput({ mode: 'search', keywords: ['AI'], searchSort: 'recent' });
        expect(r.searchSort).toBe('recent');
    });

    it('rejects invalid searchSort', () => {
        expect(() =>
            validateInput({ mode: 'search', keywords: ['AI'], searchSort: 'invalid' as never }),
        ).toThrow('searchSort must be');
    });

    it('accepts absolute dateFrom', () => {
        const r = validateInput({ mode: 'search', keywords: ['AI'], dateFrom: '2026-01-01' });
        expect(r.dateFrom).toBe('2026-01-01');
    });

    it('rejects garbage dateFrom', () => {
        expect(() =>
            validateInput({ mode: 'search', keywords: ['AI'], dateFrom: '01/01/2026' }),
        ).toThrow('dateFrom must be');
    });

    it('rejects dateFrom after dateTo', () => {
        expect(() =>
            validateInput({
                mode: 'search',
                keywords: ['AI'],
                dateFrom: '2026-03-15',
                dateTo: '2026-03-01',
            }),
        ).toThrow('dateFrom must be before dateTo');
    });
});

describe('validateInput — auto scrollCount', () => {
    it('derives scrollCount from maxPosts when omitted', () => {
        const r = validateInput({ mode: 'user', usernames: ['zuck'], maxPosts: 100 });
        expect(r.scrollCount).toBe(10);
    });

    it('clamps auto scrollCount to minimum of 3 for small maxPosts', () => {
        const r = validateInput({ mode: 'user', usernames: ['zuck'], maxPosts: 5 });
        expect(r.scrollCount).toBe(3);
    });

    it('clamps auto scrollCount to maximum of 20 for huge maxPosts', () => {
        const r = validateInput({ mode: 'user', usernames: ['zuck'], maxPosts: 500 });
        expect(r.scrollCount).toBe(20);
    });

    it('respects explicit scrollCount override (power-user API)', () => {
        const r = validateInput({ mode: 'user', usernames: ['zuck'], maxPosts: 100, scrollCount: 2 });
        expect(r.scrollCount).toBe(2);
    });
});

describe('normalizeDate', () => {
    it('returns undefined for empty input', () => {
        expect(normalizeDate(undefined, 'dateFrom')).toBeUndefined();
        expect(normalizeDate('  ', 'dateFrom')).toBeUndefined();
    });

    it('passes through absolute YYYY-MM-DD', () => {
        expect(normalizeDate('2026-01-15', 'dateFrom')).toBe('2026-01-15');
    });

    it('resolves "7 days" to an absolute date in the past', () => {
        const result = normalizeDate('7 days', 'dateFrom');
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result! < new Date().toISOString().slice(0, 10)).toBe(true);
    });

    it('accepts "1 month" and "2 weeks"', () => {
        expect(normalizeDate('1 month', 'dateFrom')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(normalizeDate('2 weeks', 'dateFrom')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('rejects unknown relative units', () => {
        expect(() => normalizeDate('7 hours', 'dateFrom')).toThrow('dateFrom must be');
    });
});
