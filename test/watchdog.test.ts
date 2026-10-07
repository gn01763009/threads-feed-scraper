/**
 * Graceful-stop watchdog: deadline arithmetic, stop-before-new-work with a fake clock, and the
 * contract marker. No network — got-scraping is mocked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const gotMock = vi.hoisted(() => vi.fn());
vi.mock('got-scraping', () => ({ gotScraping: gotMock }));

import { fetchEmbedPost } from '../src/embed.js';
import { fetchSearchPosts } from '../src/search.js';
import { fetchSsrPosts } from '../src/ssr.js';
import {
    createWatchdog,
    formatIncompleteLog,
    formatIncompleteStatus,
    INCOMPLETE_MARKER,
    isZhFirstActor,
    MIN_MARGIN_MS,
} from '../src/watchdog.js';

const T0 = Date.parse('2026-10-07T00:00:00.000Z');
const at = (offsetMs: number) => new Date(T0 + offsetMs).toISOString();

describe('createWatchdog', () => {
    it('is off when ACTOR_TIMEOUT_AT is absent or garbage', () => {
        for (const timeoutAt of [undefined, '', 'not a date']) {
            const w = createWatchdog({ timeoutAt, startedAt: at(0), now: () => T0 + 1e9 });
            expect(w.softDeadlineMs).toBeUndefined();
            expect(w.shouldStop()).toBe(false);
        }
    });

    it('uses the 45 s floor for a short run', () => {
        // 120 s run: 10% = 12 s, so the 45 s floor wins.
        const w = createWatchdog({ timeoutAt: at(120_000), startedAt: at(0), now: () => T0 });
        expect(w.softDeadlineMs).toBe(T0 + 120_000 - MIN_MARGIN_MS);
        expect(w.totalTimeoutSecs).toBe(120);
    });

    it('uses 10% of the run for a long one', () => {
        // 1 h run: 10% = 360 s.
        const w = createWatchdog({ timeoutAt: at(3_600_000), startedAt: at(0), now: () => T0 });
        expect(w.softDeadlineMs).toBe(T0 + 3_600_000 - 360_000);
    });

    it('falls back to now when ACTOR_STARTED_AT is missing', () => {
        const w = createWatchdog({ timeoutAt: at(100_000), startedAt: undefined, now: () => T0 });
        expect(w.softDeadlineMs).toBe(T0 + 100_000 - MIN_MARGIN_MS);
    });

    it('flips to stop exactly when the fake clock reaches the soft deadline', () => {
        let now = T0;
        const w = createWatchdog({ timeoutAt: at(120_000), startedAt: at(0), now: () => now });
        now = T0 + 74_999;
        expect(w.shouldStop()).toBe(false);
        now = T0 + 75_000;
        expect(w.shouldStop()).toBe(true);
    });
});

describe('incomplete reporting', () => {
    const report = { processed: 3, total: 10, pushed: 42 };

    it('puts the canary marker first on the log line, with the reason and the counts', () => {
        const line = formatIncompleteLog(report);
        expect(line.startsWith(INCOMPLETE_MARKER)).toBe(true);
        expect(line).toBe(
            '[incomplete-data] Stopped before the run timeout — 3 of 10 sources processed, 42 posts pushed; increase the run timeout or reduce sources/maxPosts.',
        );
        expect(line).not.toContain('\n');
    });

    it('orders the status message by listing language', () => {
        const zhFirst = formatIncompleteStatus(report, true);
        const enFirst = formatIncompleteStatus(report, false);
        expect(zhFirst.startsWith('因接近執行逾時')).toBe(true);
        expect(enFirst.startsWith('Stopped before the run timeout')).toBe(true);
        expect(zhFirst).toContain('3/10');
        expect(enFirst).toContain('42 posts');
    });

    it('knows the two Traditional Chinese actors', () => {
        expect(isZhFirstActor('gYxIBYI7YR97txviU')).toBe(true);
        expect(isZhFirstActor('2FBzCBI8jc8uYwAGW')).toBe(true);
        expect(isZhFirstActor('gnvZoX4vwrEze1dos')).toBe(false);
        expect(isZhFirstActor(undefined)).toBe(false);
    });
});

describe('fetchers stop before starting new work', () => {
    beforeEach(() => gotMock.mockReset());

    it('fetchSsrPosts makes no request once the deadline has passed', async () => {
        const r = await fetchSsrPosts('https://www.threads.com/@zuck', {
            sourceType: 'profile',
            sourceQuery: 'zuck',
            shouldStop: () => true,
        });
        expect(gotMock).not.toHaveBeenCalled();
        expect(r.posts).toEqual([]);
        expect(r.failure).toBeDefined();
    });

    it('fetchEmbedPost makes no request once the deadline has passed', async () => {
        const r = await fetchEmbedPost('https://www.threads.com/@zuck/post/ABC', { shouldStop: () => true });
        expect(gotMock).not.toHaveBeenCalled();
        expect(r.post).toBeNull();
    });

    it('fetchSearchPosts stops between query forms, keeps what it collected, and says so', async () => {
        const postJson = JSON.stringify({ post: { pk: '1', code: 'AAA', taken_at: 1788377183, caption: { text: 'hi' }, user: { username: 'u' } } });
        const html = `<html><script>"thread_items":[${postJson}]</script>${'x'.repeat(400_001)}</html>`;
        gotMock.mockResolvedValue({ body: html });

        let clock = 0;
        // Out of time as soon as the first form has been fetched.
        const r = await fetchSearchPosts('貓咪', {
            sourceType: 'search',
            maxPosts: 100,
            shouldStop: () => clock >= 1,
            onVariant: () => {
                clock = 1;
            },
        });

        expect(gotMock).toHaveBeenCalledTimes(1);
        expect(r.variants).toHaveLength(1);
        expect(r.stoppedEarly).toBe(true);
        expect(r.posts.map((p) => p.postId)).toEqual(['1']);
        expect(r.failure).toBeUndefined();
    });

    it('fetchSearchPosts runs every form and reports not-stopped when the clock never trips', async () => {
        gotMock.mockResolvedValue({ body: `<html>${'x'.repeat(400_001)}</html>` });
        const r = await fetchSearchPosts('貓咪', { sourceType: 'search', maxPosts: 100, shouldStop: () => false });
        expect(r.stoppedEarly).toBe(false);
        expect(r.variants).toHaveLength(4);
    });
});
