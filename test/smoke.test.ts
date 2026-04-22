/**
 * Daily smoke test — runs against real Threads via `apify run`.
 *
 * Purpose: early warning when Threads changes its DOM/markup. Kept minimal
 * (one fixture, loose assertions) so it's cheap to run daily in CI and
 * unambiguous when it breaks — any failure means the UI changed, not that
 * a unit test is flaky.
 *
 * Scope: user mode only. If this passes, the extraction pipeline still
 * works end-to-end. Broader coverage lives in test/e2e.test.ts.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { clearDataset, getDatasetItems, runActor, runActorOnApifyCloud, setInput } from './e2e-helpers.js';

const FIXTURE_PATH = join(import.meta.dirname, '..', 'test-inputs', '01-user.json');

describe('Smoke: Threads still scrapable', { timeout: 180_000 }, () => {
    let items: Record<string, unknown>[] = [];

    beforeAll(async () => {
        const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Record<string, unknown>;
        if (process.env.SMOKE_USE_CLOUD === '1') {
            items = await runActorOnApifyCloud(fixture);
        } else {
            clearDataset();
            setInput(fixture);
            const stdout = runActor();
            items = getDatasetItems();
            if (items.length === 0) {
                process.stderr.write(`\n[smoke] actor produced 0 items. Full output:\n${stdout}\n`);
            }
        }
    });

    it('extracts at least one post (UI has not broken)', () => {
        expect(items.length).toBeGreaterThanOrEqual(1);
    });

    it('post has required fields (extractor still matches DOM)', () => {
        const post = items[0];
        expect(post).toBeDefined();
        expect(typeof post.postId).toBe('string');
        expect(typeof post.author).toBe('string');
        expect(typeof post.content).toBe('string');
        expect(typeof post.likeCount).toBe('number');
        expect(typeof post.publishedAtISO).toBe('string');
    });

    it('sourceType is "profile" (mode routing intact)', () => {
        expect(items[0]?.sourceType).toBe('profile');
    });
});
