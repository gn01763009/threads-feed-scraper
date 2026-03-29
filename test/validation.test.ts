import { describe, expect, it } from 'vitest';
import { validateInput } from '../src/validation.js';

describe('validateInput', () => {
    it('throws on null input', () => {
        expect(() => validateInput(null)).toThrow('Input is required');
    });

    it('throws when no source provided', () => {
        expect(() => validateInput({})).toThrow('At least one of');
    });

    it('accepts valid feedUrls', () => {
        const result = validateInput({ feedUrls: ['https://www.threads.com/custom_feed/123'] });
        expect(result.feedUrls).toEqual(['https://www.threads.com/custom_feed/123']);
    });

    it('accepts valid searchKeywords', () => {
        const result = validateInput({ searchKeywords: ['AI news'] });
        expect(result.searchKeywords).toEqual(['AI news']);
    });

    it('accepts valid searchTags', () => {
        const result = validateInput({ searchTags: ['#tech'] });
        expect(result.searchTags).toEqual(['#tech']);
    });

    it('filters empty strings from arrays', () => {
        const result = validateInput({ searchKeywords: ['AI', '', '  ', 'tech'] });
        expect(result.searchKeywords).toEqual(['AI', 'tech']);
    });

    it('rejects invalid feed URL hostname', () => {
        expect(() => validateInput({ feedUrls: ['https://example.com/feed'] })).toThrow('Invalid feed URL');
    });

    it('accepts valid profileUrls', () => {
        const result = validateInput({ profileUrls: ['https://www.threads.com/@zuck'] });
        expect(result.profileUrls).toEqual(['https://www.threads.com/@zuck']);
    });

    it('rejects profileUrl with wrong hostname', () => {
        expect(() => validateInput({ profileUrls: ['https://example.com/@zuck'] })).toThrow('Invalid profile URL');
    });

    it('rejects profileUrl without /@username path', () => {
        expect(() => validateInput({ profileUrls: ['https://www.threads.com/search'] })).toThrow('Invalid profile URL');
    });

    it('accepts valid postUrls', () => {
        const result = validateInput({ postUrls: ['https://www.threads.com/@user/post/ABC123'] });
        expect(result.postUrls).toEqual(['https://www.threads.com/@user/post/ABC123']);
    });

    it('rejects postUrl without /post/ path', () => {
        expect(() => validateInput({ postUrls: ['https://www.threads.com/@user'] })).toThrow('Invalid post URL');
    });

    it('accepts valid searchSort "top"', () => {
        const result = validateInput({ searchKeywords: ['AI'], searchSort: 'top' });
        expect(result.searchSort).toBe('top');
    });

    it('accepts valid searchSort "recent"', () => {
        const result = validateInput({ searchKeywords: ['AI'], searchSort: 'recent' });
        expect(result.searchSort).toBe('recent');
    });

    it('rejects invalid searchSort', () => {
        expect(() => validateInput({ searchKeywords: ['AI'], searchSort: 'invalid' as any })).toThrow('searchSort must be');
    });

    it('accepts valid dateFrom', () => {
        const result = validateInput({ searchKeywords: ['AI'], dateFrom: '2026-01-01' });
        expect(result.dateFrom).toBe('2026-01-01');
    });

    it('rejects invalid dateFrom format', () => {
        expect(() => validateInput({ searchKeywords: ['AI'], dateFrom: '01/01/2026' })).toThrow('dateFrom must be YYYY-MM-DD');
    });

    it('rejects invalid dateTo format', () => {
        expect(() => validateInput({ searchKeywords: ['AI'], dateTo: 'bad' })).toThrow('dateTo must be YYYY-MM-DD');
    });

    it('rejects dateFrom after dateTo', () => {
        expect(() => validateInput({
            searchKeywords: ['AI'],
            dateFrom: '2026-03-15',
            dateTo: '2026-03-01',
        })).toThrow('dateFrom must be before dateTo');
    });
});
