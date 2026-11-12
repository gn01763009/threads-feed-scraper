/**
 * Store-listing consistency tests.
 *
 * The listing used to contradict itself: the title sold "bulk profile posts" only, the
 * SEO title promised replies the Actor does not return, and the description ended with a
 * "⚠️ mode unavailable" warning plus a price. These tests keep every locale's listing on
 * one story — the four modes that actually work — and inside the Apify field limits.
 *
 * Fast unit tests — no network.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildMetadataPatch } from '../scripts/sync-actor-metadata.ts';

const ROOT = resolve(import.meta.dirname, '..');

// Apify counts graphemes, not code units (a Thai description of 430 code points is accepted).
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const graphemes = (text: string): number => [...segmenter.segment(text)].length;

interface ActorJson {
    title: string;
    description: string;
}
interface StoreListing {
    seoTitle: string;
    seoDescription: string;
    categories: string[];
}

// The general-purpose scraper listings. `.actor-stock-zh` is a different product and keeps its own copy.
const SCRAPER_LISTINGS: Record<string, string> = {
    '.actor': 'gYxIBYI7YR97txviU',
    '.actor-en': 'gnvZoX4vwrEze1dos',
    '.actor-pt-br': 'n8Bf8q0wtO0Pwwxuj',
    '.actor-ja': 'NirQxxKuNimRK3Ae4',
    '.actor-vi': 'NEziwa5cuMejscm2W',
};

const loadActorJson = (dir: string): ActorJson =>
    JSON.parse(readFileSync(resolve(ROOT, dir, 'actor.json'), 'utf8')) as ActorJson;
const storeListings = JSON.parse(
    readFileSync(resolve(ROOT, 'scripts', 'store-listings.json'), 'utf8'),
) as Record<string, StoreListing>;

describe.each(Object.entries(SCRAPER_LISTINGS))('%s listing', (dir, actorId) => {
    const actor = loadActorJson(dir);
    const listing = storeListings[actorId];

    it('fits the Apify field limits', () => {
        expect(graphemes(actor.title)).toBeLessThanOrEqual(63);
        expect(graphemes(actor.description)).toBeLessThanOrEqual(300);
        expect(graphemes(listing.seoTitle)).toBeLessThanOrEqual(60);
        expect(graphemes(listing.seoDescription)).toBeLessThanOrEqual(200);
    });

    it('carries no warning and no price in the description', () => {
        expect(actor.description).not.toMatch(/⚠|\$\s?\d/);
        expect(actor.description).not.toContain('\n');
    });

    it('names the search and hashtag modes, not just profile posts', () => {
        const text = `${actor.title} ${actor.description}`.toLowerCase();
        expect(text).toContain('hashtag');
        expect(listing.seoDescription.toLowerCase()).toContain('hashtag');
    });

    it('has 1-3 distinct Store categories', () => {
        expect(listing.categories.length).toBeGreaterThanOrEqual(1);
        expect(listing.categories.length).toBeLessThanOrEqual(3);
        expect(new Set(listing.categories).size).toBe(listing.categories.length);
    });
});

describe('buildMetadataPatch', () => {
    const actor = { title: 'T', description: 'D' };

    it('sends only title and description when the Actor has no store listing', () => {
        expect(buildMetadataPatch(actor, undefined)).toEqual({ title: 'T', description: 'D' });
    });

    it('adds the SEO fields and categories when a store listing exists', () => {
        const listing = { seoTitle: 'S', seoDescription: 'SD', categories: ['AI'] };
        expect(buildMetadataPatch(actor, listing)).toEqual({ title: 'T', description: 'D', ...listing });
    });

    it('rejects an actor.json without a title or description', () => {
        expect(() => buildMetadataPatch({ title: 'T' }, undefined)).toThrow(/title or description/);
    });
});
