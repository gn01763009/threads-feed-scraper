/**
 * Unit tests for the search fan-out.
 *
 * No network. What matters here is not that a URL string is well-formed but that the fan-out
 * keeps the properties the measurements bought: distinct query forms, the requested sort first,
 * de-duplication across forms, and — the one that decides whether a run costs 4 requests or 16
 * — that "the query has no results" is never retried as if it were a block.
 */

import { describe, expect, it } from 'vitest';

import { buildSearchVariants, hasSsrPayload } from '../src/search.js';

describe('buildSearchVariants', () => {
    it('asks the same keyword four different ways', () => {
        const variants = buildSearchVariants('貓咪');
        expect(variants.map((v) => v.kind)).toEqual(['top', 'recent', 'hashtag', 'tags']);
    });

    // Each form contributed a mostly-disjoint set when measured; two forms resolving to the
    // same URL would silently halve the coverage this module exists to provide.
    it('gives every form its own URL', () => {
        const urls = buildSearchVariants('貓咪').map((v) => v.url);
        expect(new Set(urls).size).toBe(urls.length);
    });

    it('puts the requested sort first, because callers stop at maxPosts', () => {
        expect(buildSearchVariants('貓咪', 'recent')[0].kind).toBe('recent');
        expect(buildSearchVariants('貓咪', 'top')[0].kind).toBe('top');
    });

    it('keeps both sorts in the list — they return disjoint sets, so neither is redundant', () => {
        const kinds = buildSearchVariants('貓咪', 'recent').map((v) => v.kind);
        expect(kinds).toContain('top');
        expect(kinds).toContain('recent');
    });

    // "#foo" as `top` and "#foo" as `hashtag` are byte-identical requests; paying twice for one
    // answer is the whole cost of getting this wrong.
    it('drops the duplicate form when the keyword is already hashtagged', () => {
        const variants = buildSearchVariants('#貓咪');
        expect(variants.map((v) => v.kind)).toEqual(['recent', 'hashtag', 'tags']);
        expect(new Set(variants.map((v) => v.url)).size).toBe(variants.length);
    });

    it('searches the bare word and the hashtag form of it', () => {
        const byKind = Object.fromEntries(buildSearchVariants('貓咪').map((v) => [v.kind, v.url]));
        expect(decodeURIComponent(byKind.top)).toContain('q=貓咪');
        expect(decodeURIComponent(byKind.hashtag)).toContain('q=#貓咪');
        expect(byKind.recent).toContain('serp_type=recent');
        expect(byKind.tags).toContain('serp_type=tags');
    });

    it('normalises a hashtagged keyword before building the non-hashtag forms', () => {
        const byKind = Object.fromEntries(buildSearchVariants('#貓咪').map((v) => [v.kind, v.url]));
        expect(decodeURIComponent(byKind.tags)).toContain('q=貓咪');
        expect(decodeURIComponent(byKind.tags)).not.toContain('q=#');
    });
});

describe('hasSsrPayload', () => {
    // The numbers are the point: every shell measured 261-263 KB and every page carrying the
    // payload 553-1219 KB, so the threshold sits inside a 2x gap. A shell must stay retryable
    // and a real page must not — including a real page that legitimately found nothing, which
    // is why post count cannot be the discriminator.
    it('treats a shell-sized response as payload-free', () => {
        expect(hasSsrPayload('x'.repeat(263 * 1024))).toBe(false);
    });

    it('treats a search page with zero results as a real page, not a block', () => {
        expect(hasSsrPayload('x'.repeat(553 * 1024))).toBe(true);
    });

    it('accepts a full results page', () => {
        expect(hasSsrPayload('x'.repeat(1219 * 1024))).toBe(true);
    });

    it('rejects an empty body', () => {
        expect(hasSsrPayload('')).toBe(false);
    });
});
