# Threads Feed Scraper Phase 1 & 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add profile/post scraping, media extraction, timestamp normalization, replies, search sorting, date filtering, extra metrics, and comprehensive test coverage.

**Architecture:** Extend existing source-type pattern (feedUrls/searchKeywords/searchTags) with new sources (profileUrls, postUrls). Extract pure functions from evaluate strings for testability. Add new browser-side extraction for media/replies. All new features follow existing immutable patterns.

**Tech Stack:** TypeScript, Playwright/Crawlee, Apify SDK, Vitest

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types.ts` | Modify | Add new SourceTypes, input fields, output fields, ThreadsReply interface |
| `src/validation.ts` | Modify | Validate profileUrls, postUrls, searchSort, dateFrom, dateTo |
| `src/urls.ts` | Modify | Add buildProfileUrl, extend buildSearchUrl with sort param |
| `src/time.ts` | Create | Timestamp normalization (relative "5d" and absolute "03/04/26" to ISO 8601) |
| `src/extract.ts` | Modify | Add media extraction, media type detection, view/quote counts |
| `src/replies.ts` | Create | Browser-side reply extraction script for single post pages |
| `src/main.ts` | Modify | Add profile/post sources, reply crawling, date filtering |
| `.actor/input_schema.json` | Modify | Add new input fields |
| `.actor/dataset_schema.json` | Modify | Add new output columns |
| `test/validation.test.ts` | Create | Input validation tests |
| `test/urls.test.ts` | Create | URL builder tests |
| `test/time.test.ts` | Create | Timestamp normalization tests |
| `test/extract.test.ts` | Create | Extraction pure function tests |
| `test/replies.test.ts` | Create | Reply extraction tests |
| `vitest.config.ts` | Create | Vitest config with coverage |

---

### Task 1: Vitest Coverage Setup

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install coverage dependency**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npm install -D @vitest/coverage-v8
```

- [ ] **Step 2: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/main.ts'],
            thresholds: {
                statements: 80,
                branches: 80,
                functions: 80,
                lines: 80,
            },
        },
    },
});
```

- [ ] **Step 3: Add coverage script to package.json**

Add to scripts:
```json
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 4: Run to verify setup**

```bash
npm run test:coverage
```

Expected: Passes (existing placeholder test), shows coverage report.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json package-lock.json
git commit -m "chore: add vitest coverage config with 80% thresholds"
```

---

### Task 2: Types — Extend SourceType, InputSchema, ThreadsPost

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Update types.ts with all new types**

```typescript
export type SourceType = 'feed' | 'search' | 'tag' | 'profile' | 'post';

export type SearchSort = 'top' | 'recent';

export type MediaType = 'text' | 'photo' | 'video' | 'carousel';

export interface ThreadsMedia {
    url: string;
    type: 'image' | 'video';
}

export interface ThreadsReply {
    author: string;
    content: string;
    publishedAt: string;
    likeCount: number;
}

export interface ThreadsPost {
    postId: string;
    author: string;
    content: string;
    publishedAt: string;
    publishedAtISO: string;
    likeCount: number;
    replyCount: number;
    repostCount: number;
    shareCount: number;
    viewCount: number;
    quoteCount: number;
    mediaType: MediaType;
    mediaUrls: ThreadsMedia[];
    postUrl: string;
    sourceType: SourceType;
    sourceQuery: string;
    scrapedAt: string;
    replies: ThreadsReply[];
}

export interface InputSchema {
    feedUrls?: string[];
    searchKeywords?: string[];
    searchTags?: string[];
    profileUrls?: string[];
    postUrls?: string[];
    maxPosts?: number;
    scrollCount?: number;
    searchSort?: SearchSort;
    dateFrom?: string;
    dateTo?: string;
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx tsc --noEmit 2>&1 | head -20
```

Expected: Type errors in other files (expected, will fix in subsequent tasks).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: extend types for profile, post, media, replies, sorting, date filter"
```

---

### Task 3: Timestamp Normalization — TDD

**Files:**
- Create: `src/time.ts`
- Create: `test/time.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/time.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeTimestamp } from '../src/time.js';

describe('normalizeTimestamp', () => {
    it('converts relative minutes "30m" to ISO string', () => {
        const result = normalizeTimestamp('30m');
        const parsed = new Date(result);
        expect(parsed.getTime()).not.toBeNaN();
        const diffMs = Date.now() - parsed.getTime();
        // Should be roughly 30 minutes ago (allow 5s tolerance)
        expect(diffMs).toBeGreaterThan(29 * 60 * 1000);
        expect(diffMs).toBeLessThan(31 * 60 * 1000);
    });

    it('converts relative hours "5h" to ISO string', () => {
        const result = normalizeTimestamp('5h');
        const parsed = new Date(result);
        const diffMs = Date.now() - parsed.getTime();
        expect(diffMs).toBeGreaterThan(4.9 * 60 * 60 * 1000);
        expect(diffMs).toBeLessThan(5.1 * 60 * 60 * 1000);
    });

    it('converts relative days "5d" to ISO string', () => {
        const result = normalizeTimestamp('5d');
        const parsed = new Date(result);
        const diffMs = Date.now() - parsed.getTime();
        expect(diffMs).toBeGreaterThan(4.9 * 24 * 60 * 60 * 1000);
        expect(diffMs).toBeLessThan(5.1 * 24 * 60 * 60 * 1000);
    });

    it('converts relative weeks "2w" to ISO string', () => {
        const result = normalizeTimestamp('2w');
        const parsed = new Date(result);
        const diffMs = Date.now() - parsed.getTime();
        expect(diffMs).toBeGreaterThan(13.9 * 24 * 60 * 60 * 1000);
        expect(diffMs).toBeLessThan(14.1 * 24 * 60 * 60 * 1000);
    });

    it('converts absolute date "03/04/26" (MM/DD/YY) to ISO string', () => {
        const result = normalizeTimestamp('03/04/26');
        expect(result).toBe('2026-03-04T00:00:00.000Z');
    });

    it('converts absolute date "12/25/25" to ISO string', () => {
        const result = normalizeTimestamp('12/25/25');
        expect(result).toBe('2025-12-25T00:00:00.000Z');
    });

    it('returns empty string for empty input', () => {
        expect(normalizeTimestamp('')).toBe('');
    });

    it('returns empty string for unrecognized format', () => {
        expect(normalizeTimestamp('yesterday')).toBe('');
    });

    it('handles "1s" (seconds)', () => {
        const result = normalizeTimestamp('1s');
        const parsed = new Date(result);
        const diffMs = Date.now() - parsed.getTime();
        expect(diffMs).toBeLessThan(5 * 1000);
    });
});
```

- [ ] **Step 2: Run test — should FAIL**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx vitest run test/time.test.ts
```

Expected: FAIL — module `../src/time.js` not found.

- [ ] **Step 3: Implement time.ts**

```typescript
// src/time.ts

const RELATIVE_PATTERN = /^(\d+)([smhdw])$/i;
const ABSOLUTE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{2})$/;

const UNIT_TO_MS: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
};

export function normalizeTimestamp(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    const relativeMatch = trimmed.match(RELATIVE_PATTERN);
    if (relativeMatch) {
        const value = parseInt(relativeMatch[1], 10);
        const unit = relativeMatch[2].toLowerCase();
        const ms = UNIT_TO_MS[unit];
        if (ms) {
            return new Date(Date.now() - value * ms).toISOString();
        }
    }

    const absoluteMatch = trimmed.match(ABSOLUTE_PATTERN);
    if (absoluteMatch) {
        const month = absoluteMatch[1];
        const day = absoluteMatch[2];
        const year = `20${absoluteMatch[3]}`;
        return new Date(`${year}-${month}-${day}T00:00:00.000Z`).toISOString();
    }

    return '';
}
```

- [ ] **Step 4: Run test — should PASS**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx vitest run test/time.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/time.ts test/time.test.ts
git commit -m "feat: add timestamp normalization with TDD tests"
```

---

### Task 4: URL Builders — Extend with Profile, Post, Sort

**Files:**
- Modify: `src/urls.ts`
- Create: `test/urls.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/urls.test.ts
import { describe, expect, it } from 'vitest';
import { buildSearchUrl, buildTagUrl, buildProfileUrl, buildPostUrl } from '../src/urls.js';

describe('buildSearchUrl', () => {
    it('builds basic search URL', () => {
        const url = buildSearchUrl('AI news');
        expect(url).toBe('https://www.threads.com/search?q=AI+news');
    });

    it('builds search URL with top sort', () => {
        const url = buildSearchUrl('AI news', 'top');
        expect(url).toBe('https://www.threads.com/search?q=AI+news&serp_type=default');
    });

    it('builds search URL with recent sort', () => {
        const url = buildSearchUrl('AI news', 'recent');
        expect(url).toBe('https://www.threads.com/search?q=AI+news&serp_type=default&filter=recent');
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
```

- [ ] **Step 2: Run test — should FAIL**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx vitest run test/urls.test.ts
```

Expected: FAIL — `buildProfileUrl` and `buildPostUrl` not exported.

- [ ] **Step 3: Update urls.ts**

```typescript
// src/urls.ts
import type { SearchSort } from './types.js';

const THREADS_SEARCH_BASE = 'https://www.threads.com/search';
const THREADS_BASE = 'https://www.threads.com';

export function buildSearchUrl(keyword: string, sort?: SearchSort): string {
    const url = new URL(THREADS_SEARCH_BASE);
    url.searchParams.set('q', keyword);
    if (sort) {
        url.searchParams.set('serp_type', 'default');
        if (sort === 'recent') {
            url.searchParams.set('filter', 'recent');
        }
    }
    return url.toString();
}

export function buildTagUrl(tag: string): string {
    const cleaned = tag.startsWith('#') ? tag.slice(1) : tag;
    const url = new URL(THREADS_SEARCH_BASE);
    url.searchParams.set('q', cleaned);
    url.searchParams.set('serp_type', 'tags');
    return url.toString();
}

export function buildProfileUrl(username: string): string {
    const cleaned = username.startsWith('@') ? username.slice(1) : username;
    return `${THREADS_BASE}/@${cleaned}`;
}

export function buildPostUrl(postUrl: string): string {
    return postUrl;
}
```

- [ ] **Step 4: Run test — should PASS**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx vitest run test/urls.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/urls.ts test/urls.test.ts
git commit -m "feat: add profile/post URL builders and search sort support"
```

---

### Task 5: Validation — Extend for New Input Fields

**Files:**
- Modify: `src/validation.ts`
- Create: `test/validation.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/validation.test.ts
import { describe, expect, it } from 'vitest';
import { validateInput } from '../src/validation.js';

describe('validateInput', () => {
    // Existing behavior
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

    // New: profileUrls
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

    // New: postUrls
    it('accepts valid postUrls', () => {
        const result = validateInput({ postUrls: ['https://www.threads.com/@user/post/ABC123'] });
        expect(result.postUrls).toEqual(['https://www.threads.com/@user/post/ABC123']);
    });

    it('rejects postUrl without /post/ path', () => {
        expect(() => validateInput({ postUrls: ['https://www.threads.com/@user'] })).toThrow('Invalid post URL');
    });

    // New: searchSort
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

    // New: date range
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
```

- [ ] **Step 2: Run test — should FAIL**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx vitest run test/validation.test.ts
```

Expected: FAIL on profileUrls, postUrls, searchSort, date tests.

- [ ] **Step 3: Update validation.ts**

```typescript
// src/validation.ts
import type { InputSchema, SearchSort } from './types.js';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VALID_SORTS: SearchSort[] = ['top', 'recent'];

export function validateInput(raw: InputSchema | null | undefined): InputSchema {
    if (!raw) {
        throw new Error('Input is required');
    }

    const feedUrls = filterNonEmpty(raw.feedUrls);
    const searchKeywords = filterNonEmpty(raw.searchKeywords);
    const searchTags = filterNonEmpty(raw.searchTags);
    const profileUrls = filterNonEmpty(raw.profileUrls);
    const postUrls = filterNonEmpty(raw.postUrls);

    if (
        feedUrls.length === 0 &&
        searchKeywords.length === 0 &&
        searchTags.length === 0 &&
        profileUrls.length === 0 &&
        postUrls.length === 0
    ) {
        throw new Error(
            'At least one of feedUrls, searchKeywords, searchTags, profileUrls, or postUrls must be provided',
        );
    }

    for (const url of feedUrls) {
        assertThreadsHostname(url, 'feed');
    }

    for (const url of profileUrls) {
        assertThreadsHostname(url, 'profile');
        const parsed = new URL(url);
        if (!parsed.pathname.match(/^\/@[^/]+$/)) {
            throw new Error(`Invalid profile URL (must be threads.com/@username): ${url}`);
        }
    }

    for (const url of postUrls) {
        assertThreadsHostname(url, 'post');
        const parsed = new URL(url);
        if (!parsed.pathname.includes('/post/')) {
            throw new Error(`Invalid post URL (must contain /post/): ${url}`);
        }
    }

    if (raw.searchSort !== undefined) {
        if (!VALID_SORTS.includes(raw.searchSort)) {
            throw new Error(`searchSort must be one of: ${VALID_SORTS.join(', ')}`);
        }
    }

    if (raw.dateFrom !== undefined) {
        if (!DATE_PATTERN.test(raw.dateFrom)) {
            throw new Error('dateFrom must be YYYY-MM-DD format');
        }
    }

    if (raw.dateTo !== undefined) {
        if (!DATE_PATTERN.test(raw.dateTo)) {
            throw new Error('dateTo must be YYYY-MM-DD format');
        }
    }

    if (raw.dateFrom && raw.dateTo && raw.dateFrom > raw.dateTo) {
        throw new Error('dateFrom must be before dateTo');
    }

    return {
        feedUrls: feedUrls.length > 0 ? feedUrls : undefined,
        searchKeywords: searchKeywords.length > 0 ? searchKeywords : undefined,
        searchTags: searchTags.length > 0 ? searchTags : undefined,
        profileUrls: profileUrls.length > 0 ? profileUrls : undefined,
        postUrls: postUrls.length > 0 ? postUrls : undefined,
        maxPosts: raw.maxPosts,
        scrollCount: raw.scrollCount,
        searchSort: raw.searchSort,
        dateFrom: raw.dateFrom,
        dateTo: raw.dateTo,
    };
}

function assertThreadsHostname(url: string, label: string): void {
    try {
        const parsed = new URL(url);
        if (!['threads.com', 'www.threads.com'].includes(parsed.hostname)) {
            throw new Error(`Invalid ${label} URL (must be threads.com): ${url}`);
        }
    } catch (err) {
        if (err instanceof Error && err.message.startsWith('Invalid')) throw err;
        throw new Error(`Invalid ${label} URL: ${url}`);
    }
}

function filterNonEmpty(arr: string[] | undefined): string[] {
    if (!arr) return [];
    return arr.map((s) => s.trim()).filter((s) => s.length > 0);
}
```

- [ ] **Step 4: Run test — should PASS**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx vitest run test/validation.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/validation.ts test/validation.test.ts
git commit -m "feat: validate profileUrls, postUrls, searchSort, dateFrom/dateTo"
```

---

### Task 6: Extract — Add Media, Views, Quotes, Timestamp Normalization

**Files:**
- Modify: `src/extract.ts`
- Create: `test/extract.test.ts`

- [ ] **Step 1: Write tests for pure extraction helpers**

```typescript
// test/extract.test.ts
import { describe, expect, it } from 'vitest';
import { parseCount, detectMediaType } from '../src/extract.js';

describe('parseCount', () => {
    it('returns 0 for empty string', () => {
        expect(parseCount('')).toBe(0);
    });

    it('returns 0 for undefined', () => {
        expect(parseCount(undefined)).toBe(0);
    });

    it('parses plain number', () => {
        expect(parseCount('42')).toBe(42);
    });

    it('parses K suffix', () => {
        expect(parseCount('1.7K')).toBe(1700);
    });

    it('parses k suffix lowercase', () => {
        expect(parseCount('2.5k')).toBe(2500);
    });

    it('parses M suffix', () => {
        expect(parseCount('3.2M')).toBe(3200000);
    });

    it('handles commas', () => {
        expect(parseCount('1,234')).toBe(1234);
    });

    it('returns 0 for non-numeric', () => {
        expect(parseCount('abc')).toBe(0);
    });
});

describe('detectMediaType', () => {
    it('returns "text" when no media', () => {
        expect(detectMediaType([], [])).toBe('text');
    });

    it('returns "photo" for single image', () => {
        expect(detectMediaType(['img.jpg'], [])).toBe('photo');
    });

    it('returns "video" for single video', () => {
        expect(detectMediaType([], ['vid.mp4'])).toBe('video');
    });

    it('returns "carousel" for multiple images', () => {
        expect(detectMediaType(['a.jpg', 'b.jpg'], [])).toBe('carousel');
    });

    it('returns "carousel" for mixed media', () => {
        expect(detectMediaType(['a.jpg'], ['b.mp4'])).toBe('carousel');
    });
});
```

- [ ] **Step 2: Run test — should FAIL**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx vitest run test/extract.test.ts
```

Expected: FAIL — `parseCount` and `detectMediaType` not exported.

- [ ] **Step 3: Refactor extract.ts — export pure functions and extend extraction**

```typescript
// src/extract.ts
/**
 * Browser-side extraction logic and shared pure functions.
 */

import type { MediaType, SourceType } from './types.js';

/** Parse engagement count strings like "1.7K", "3.2M", "1,234" → number */
export function parseCount(raw: string | undefined | null): number {
    if (!raw) return 0;
    const cleaned = raw.replace(/,/g, '');
    const kMatch = cleaned.match(/^([\d.]+)K$/i);
    if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
    const mMatch = cleaned.match(/^([\d.]+)M$/i);
    if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
    return parseInt(cleaned, 10) || 0;
}

/** Detect media type from arrays of image and video URLs */
export function detectMediaType(imageUrls: string[], videoUrls: string[]): MediaType {
    const total = imageUrls.length + videoUrls.length;
    if (total === 0) return 'text';
    if (total > 1) return 'carousel';
    if (videoUrls.length > 0) return 'video';
    return 'photo';
}

/**
 * Build the browser-side extraction script string.
 * Injected into page.evaluate() — must be self-contained (no closures over Node vars).
 */
export function getExtractScript(
    maxPosts: number,
    sourceType: SourceType,
    sourceQuery: string,
): string {
    return `
    (() => {
        const results = [];
        const seen = new Set();

        let containers = document.querySelectorAll('[data-pressable-container="true"]');

        if (containers.length === 0) {
            containers = document.querySelectorAll('div[role="article"], article');
        }

        if (containers.length === 0) {
            const postLinks = document.querySelectorAll('a[href*="/post/"]');
            const parentSet = new Set();
            postLinks.forEach(link => {
                let parent = link.parentElement;
                for (let i = 0; i < 5 && parent; i++) {
                    if (parent.children.length > 2) {
                        parentSet.add(parent);
                        break;
                    }
                    parent = parent.parentElement;
                }
            });
            containers = Array.from(parentSet);
        }

        const scrapedAt = new Date().toISOString();

        const parseCount = (raw) => {
            if (!raw) return 0;
            const cleaned = raw.replace(/,/g, '');
            const kMatch = cleaned.match(/^([\\d.]+)K$/i);
            if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
            const mMatch = cleaned.match(/^([\\d.]+)M$/i);
            if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
            return parseInt(cleaned, 10) || 0;
        };

        const RELATIVE_PATTERN = /^(\\d+)([smhdw])$/i;
        const ABSOLUTE_PATTERN = /^(\\d{2})\\/(\\d{2})\\/(\\d{2})$/;
        const UNIT_TO_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };

        const normalizeTimestamp = (raw) => {
            if (!raw) return '';
            const trimmed = raw.trim();
            if (!trimmed) return '';
            const relMatch = trimmed.match(RELATIVE_PATTERN);
            if (relMatch) {
                const val = parseInt(relMatch[1], 10);
                const unit = relMatch[2].toLowerCase();
                const ms = UNIT_TO_MS[unit];
                if (ms) return new Date(Date.now() - val * ms).toISOString();
            }
            const absMatch = trimmed.match(ABSOLUTE_PATTERN);
            if (absMatch) {
                return new Date('20' + absMatch[3] + '-' + absMatch[1] + '-' + absMatch[2] + 'T00:00:00.000Z').toISOString();
            }
            return '';
        };

        const detectMediaType = (imageUrls, videoUrls) => {
            const total = imageUrls.length + videoUrls.length;
            if (total === 0) return 'text';
            if (total > 1) return 'carousel';
            if (videoUrls.length > 0) return 'video';
            return 'photo';
        };

        for (const el of containers) {
            if (results.length >= ${maxPosts}) break;

            const textContent = (el.textContent || '').trim();
            if (textContent.length < 10) continue;

            const postLink = el.querySelector('a[href*="/post/"]');
            const postUrl = postLink ? postLink.href : '';

            const postIdMatch = postUrl.match(/\\/post\\/([A-Za-z0-9_-]+)/);
            const postId = postIdMatch ? postIdMatch[1] : 'unknown_' + results.length;

            if (seen.has(postId)) continue;
            seen.add(postId);

            const authorLink = el.querySelector('a[href^="/@"]');
            let author = 'unknown';
            if (authorLink) {
                const linkText = (authorLink.textContent || '').trim();
                if (linkText) {
                    author = linkText;
                } else if (authorLink.href) {
                    const m = authorLink.href.match(/@([^/?]+)/);
                    if (m) author = m[1];
                }
            }

            const timeEl = el.querySelector('time');
            const publishedAt = timeEl ? (timeEl.textContent || '').trim() : '';
            const publishedAtISO = normalizeTimestamp(publishedAt);

            const spans = el.querySelectorAll('span');
            let content = '';
            for (const s of spans) {
                const t = (s.textContent || '').trim();
                if (t.length > 20 && t !== author && !/^\\d+[hmd]$/.test(t)) {
                    content = t;
                    break;
                }
            }

            if (!content) {
                content = textContent.slice(0, 500);
            }

            // Extract media URLs
            const images = el.querySelectorAll('img[src]');
            const videos = el.querySelectorAll('video source[src], video[src]');
            const imageUrls = [];
            const videoUrls = [];

            for (const img of images) {
                const src = img.src || '';
                // Skip profile pics, icons, and tiny images
                if (src && !src.includes('profile') && !src.includes('icon') && !src.includes('emoji')) {
                    imageUrls.push(src);
                }
            }

            for (const vid of videos) {
                const src = vid.src || '';
                if (src) {
                    videoUrls.push(src);
                }
            }

            const mediaType = detectMediaType(imageUrls, videoUrls);
            const mediaUrls = [
                ...imageUrls.map(u => ({ url: u, type: 'image' })),
                ...videoUrls.map(u => ({ url: u, type: 'video' })),
            ];

            const buttons = el.querySelectorAll('[role="button"]');
            const engagement = { like: 0, comment: 0, repost: 0, share: 0, view: 0, quote: 0 };

            for (const btn of buttons) {
                const btnText = (btn.textContent || '').trim();
                const countMatch = btnText.match(/^(?:Like|Comment|Repost|Share|View|Quote)([\\d.,]+[KkMm]?)$/);
                if (!countMatch) continue;
                const count = parseCount(countMatch[1]);
                if (btnText.startsWith('Like')) engagement.like = count;
                else if (btnText.startsWith('Comment')) engagement.comment = count;
                else if (btnText.startsWith('Repost')) engagement.repost = count;
                else if (btnText.startsWith('Share')) engagement.share = count;
                else if (btnText.startsWith('View')) engagement.view = count;
                else if (btnText.startsWith('Quote')) engagement.quote = count;
            }

            results.push({
                postId,
                author,
                content,
                publishedAt,
                publishedAtISO,
                likeCount: engagement.like,
                replyCount: engagement.comment,
                repostCount: engagement.repost,
                shareCount: engagement.share,
                viewCount: engagement.view,
                quoteCount: engagement.quote,
                mediaType,
                mediaUrls,
                postUrl,
                sourceType: ${JSON.stringify(sourceType)},
                sourceQuery: ${JSON.stringify(sourceQuery)},
                scrapedAt,
                replies: [],
            });
        }

        return results;
    })()
    `;
}

export const DEBUG_SCRIPT = \`
(() => {
    const body = document.body;
    const children = Array.from(body.children).slice(0, 10).map(c => ({
        tag: c.tagName,
        id: c.id,
        className: (c.className || '').toString().slice(0, 80),
        childCount: c.children.length,
        textLength: (c.textContent || '').length,
    }));
    return { childCount: body.children.length, children: children };
})()
\`;
```

- [ ] **Step 4: Run test — should PASS**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx vitest run test/extract.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/extract.ts test/extract.test.ts
git commit -m "feat: add media extraction, views/quotes, timestamp normalization in extract"
```

---

### Task 7: Replies Extraction Script

**Files:**
- Create: `src/replies.ts`
- Create: `test/replies.test.ts`

- [ ] **Step 1: Write tests for reply parsing helpers**

```typescript
// test/replies.test.ts
import { describe, expect, it } from 'vitest';
import { getReplyExtractScript } from '../src/replies.js';

describe('getReplyExtractScript', () => {
    it('returns a non-empty string', () => {
        const script = getReplyExtractScript(10);
        expect(typeof script).toBe('string');
        expect(script.length).toBeGreaterThan(0);
    });

    it('embeds maxReplies in the script', () => {
        const script = getReplyExtractScript(25);
        expect(script).toContain('25');
    });
});
```

- [ ] **Step 2: Run test — should FAIL**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx vitest run test/replies.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement replies.ts**

```typescript
// src/replies.ts
/**
 * Browser-side reply extraction script for single post pages.
 * Injected into page.evaluate() on post detail pages.
 */

export function getReplyExtractScript(maxReplies: number): string {
    return `
    (() => {
        const replies = [];
        const containers = document.querySelectorAll('[data-pressable-container="true"], div[role="article"], article');

        // Skip the first container (it's the original post)
        const replyContainers = Array.from(containers).slice(1);

        const parseCount = (raw) => {
            if (!raw) return 0;
            const cleaned = raw.replace(/,/g, '');
            const kMatch = cleaned.match(/^([\\d.]+)K$/i);
            if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
            const mMatch = cleaned.match(/^([\\d.]+)M$/i);
            if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
            return parseInt(cleaned, 10) || 0;
        };

        for (const el of replyContainers) {
            if (replies.length >= ${maxReplies}) break;

            const textContent = (el.textContent || '').trim();
            if (textContent.length < 5) continue;

            const authorLink = el.querySelector('a[href^="/@"]');
            let author = 'unknown';
            if (authorLink) {
                const linkText = (authorLink.textContent || '').trim();
                if (linkText) {
                    author = linkText;
                } else if (authorLink.href) {
                    const m = authorLink.href.match(/@([^/?]+)/);
                    if (m) author = m[1];
                }
            }

            const timeEl = el.querySelector('time');
            const publishedAt = timeEl ? (timeEl.textContent || '').trim() : '';

            const spans = el.querySelectorAll('span');
            let content = '';
            for (const s of spans) {
                const t = (s.textContent || '').trim();
                if (t.length > 10 && t !== author && !/^\\d+[hmd]$/.test(t)) {
                    content = t;
                    break;
                }
            }

            if (!content) {
                content = textContent.slice(0, 500);
            }

            let likeCount = 0;
            const buttons = el.querySelectorAll('[role="button"]');
            for (const btn of buttons) {
                const btnText = (btn.textContent || '').trim();
                const countMatch = btnText.match(/^Like([\\d.,]+[KkMm]?)$/);
                if (countMatch) {
                    likeCount = parseCount(countMatch[1]);
                    break;
                }
            }

            replies.push({ author, content, publishedAt, likeCount });
        }

        return replies;
    })()
    `;
}
```

- [ ] **Step 4: Run test — should PASS**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx vitest run test/replies.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/replies.ts test/replies.test.ts
git commit -m "feat: add reply extraction script for post detail pages"
```

---

### Task 8: Main — Wire Up All New Sources and Features

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Update main.ts with all new features**

```typescript
// src/main.ts
import { Actor, log } from 'apify';
import { PlaywrightCrawler, Dataset } from '@crawlee/playwright';
import { getExtractScript, DEBUG_SCRIPT } from './extract.js';
import { getReplyExtractScript } from './replies.js';
import { validateInput } from './validation.js';
import { buildSearchUrl, buildTagUrl, buildProfileUrl, buildPostUrl } from './urls.js';
import type { InputSchema, ThreadsPost, ThreadsReply, SourceType } from './types.js';

const HYDRATION_DELAY_MS = 3_000;
const SCROLL_DELAY_MS = 2_000;
const REPLY_SCROLL_COUNT = 3;
const MAX_REPLIES_PER_POST = 20;

interface RequestUserData {
    sourceType: SourceType;
    sourceQuery: string;
}

await Actor.init();

const rawInput = await Actor.getInput<InputSchema>();
const input = validateInput(rawInput);

const maxPosts = input.maxPosts ?? 50;
const scrollCount = input.scrollCount ?? 5;
let totalItems = 0;

const sources: Array<[string[] | undefined, (q: string) => string, SourceType]> = [
    [input.feedUrls, (u) => u, 'feed'],
    [input.searchKeywords, (k) => buildSearchUrl(k, input.searchSort), 'search'],
    [input.searchTags, buildTagUrl, 'tag'],
    [input.profileUrls, buildProfileUrl, 'profile'],
    [input.postUrls, buildPostUrl, 'post'],
];

const requests: { url: string; userData: RequestUserData }[] = [];
for (const [items, buildUrl, sourceType] of sources) {
    for (const query of items ?? []) {
        requests.push({ url: buildUrl(query), userData: { sourceType, sourceQuery: query } });
    }
}

log.info('Starting Threads scraper', {
    feedUrls: input.feedUrls,
    searchKeywords: input.searchKeywords,
    searchTags: input.searchTags,
    profileUrls: input.profileUrls,
    postUrls: input.postUrls,
    searchSort: input.searchSort,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    totalRequests: requests.length,
    maxPosts,
    scrollCount,
});

/**
 * Filter posts by date range if dateFrom/dateTo is specified.
 * Uses publishedAtISO for comparison.
 */
function filterByDateRange(posts: readonly ThreadsPost[]): ThreadsPost[] {
    if (!input.dateFrom && !input.dateTo) return [...posts];

    return posts.filter((post) => {
        if (!post.publishedAtISO) return true; // Keep posts with unknown dates
        const postDate = post.publishedAtISO.slice(0, 10); // YYYY-MM-DD
        if (input.dateFrom && postDate < input.dateFrom) return false;
        if (input.dateTo && postDate > input.dateTo) return false;
        return true;
    });
}

const crawler = new PlaywrightCrawler({
    headless: true,
    maxConcurrency: 1,
    navigationTimeoutSecs: 60,
    requestHandlerTimeoutSecs: 120,
    launchContext: {
        launchOptions: {
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
            ],
        },
    },
    async requestHandler({ page, request }) {
        const { sourceType, sourceQuery } = request.userData as RequestUserData;
        log.info(`Navigating to ${sourceType}: ${request.url}`);

        await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {
            log.warning('Network idle timeout — proceeding with available content');
        });

        await page.waitForTimeout(HYDRATION_DELAY_MS);

        // For single post pages, extract the post + replies
        if (sourceType === 'post') {
            // Scroll to load replies
            for (let i = 0; i < REPLY_SCROLL_COUNT; i++) {
                await page.evaluate('window.scrollBy(0, window.innerHeight * 2)');
                await page.waitForTimeout(SCROLL_DELAY_MS);
            }

            // Extract main post
            const extractScript = getExtractScript(1, sourceType, sourceQuery);
            const posts: ThreadsPost[] = await page.evaluate(extractScript);

            if (posts.length > 0) {
                // Extract replies
                const replyScript = getReplyExtractScript(MAX_REPLIES_PER_POST);
                const replies: ThreadsReply[] = await page.evaluate(replyScript);
                const postsWithReplies = posts.map((post) => ({ ...post, replies }));

                const filtered = filterByDateRange(postsWithReplies);
                if (filtered.length > 0) {
                    await Dataset.pushData(filtered);
                    totalItems += filtered.length;
                }
                log.info(`Extracted post with ${replies.length} replies from ${sourceQuery}`);
            } else {
                const debugInfo = await page.evaluate(DEBUG_SCRIPT);
                log.warning('No post found on detail page. Structure:', debugInfo as Record<string, unknown>);
            }
            return;
        }

        // For feed/search/tag/profile pages: scroll and extract multiple posts
        for (let i = 0; i < scrollCount; i++) {
            await page.evaluate('window.scrollBy(0, window.innerHeight * 2)');
            await page.waitForTimeout(SCROLL_DELAY_MS);
            log.info(`Scroll ${i + 1}/${scrollCount} complete`);
        }

        const extractScript = getExtractScript(maxPosts, sourceType, sourceQuery);
        const posts: ThreadsPost[] = await page.evaluate(extractScript);

        log.info(`Extracted ${posts.length} posts from ${sourceType}:${sourceQuery}`);

        if (posts.length === 0) {
            const debugInfo = await page.evaluate(DEBUG_SCRIPT);
            log.warning('No posts found. Page structure:', debugInfo as Record<string, unknown>);

            const screenshotKey = `debug-screenshot-${sourceType}-${Date.now()}`;
            const screenshot = await page.screenshot({ fullPage: false });
            await Actor.setValue(screenshotKey, screenshot, { contentType: 'image/png' });
            log.info(`Debug screenshot saved as "${screenshotKey}"`);
        } else {
            const filtered = filterByDateRange(posts);
            if (filtered.length > 0) {
                await Dataset.pushData(filtered);
                totalItems += filtered.length;
            }
            log.info(`After date filter: ${filtered.length}/${posts.length} posts kept`);
        }
    },

    failedRequestHandler(_ctx, error) {
        log.error(`Request failed: ${_ctx.request.url}`, { error: (error as Error).message });
    },
});

await crawler.run(requests);

log.info(`Scraping complete. Total items: ${totalItems}`);

await Actor.exit();
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire up profile/post scraping, replies, date filtering, search sort"
```

---

### Task 9: Input & Dataset Schemas — Update for New Fields

**Files:**
- Modify: `.actor/input_schema.json`
- Modify: `.actor/dataset_schema.json`

- [ ] **Step 1: Update input_schema.json**

Add these properties to the existing schema:

```json
"profileUrls": {
    "title": "Profile URLs",
    "type": "array",
    "description": "Threads profile URLs to scrape posts from (e.g. https://www.threads.com/@zuck). Leading @ is optional.",
    "editor": "stringList",
    "items": { "type": "string" }
},
"postUrls": {
    "title": "Post URLs",
    "type": "array",
    "description": "Individual Threads post URLs to scrape with replies (e.g. https://www.threads.com/@user/post/ABC123).",
    "editor": "stringList",
    "items": { "type": "string" }
},
"searchSort": {
    "title": "Search Sort",
    "type": "string",
    "description": "Sort order for search results. Only applies to searchKeywords.",
    "enum": ["top", "recent"],
    "enumTitles": ["Top (default)", "Recent"],
    "default": "top"
},
"dateFrom": {
    "title": "Date From",
    "type": "string",
    "description": "Filter posts from this date (YYYY-MM-DD). Posts before this date are excluded.",
    "editor": "textfield",
    "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
},
"dateTo": {
    "title": "Date To",
    "type": "string",
    "description": "Filter posts until this date (YYYY-MM-DD). Posts after this date are excluded.",
    "editor": "textfield",
    "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
}
```

- [ ] **Step 2: Update dataset_schema.json**

Add new fields to the transformation.fields array and display.properties:

New fields to add: `publishedAtISO`, `viewCount`, `quoteCount`, `mediaType`, `mediaUrls`, `replies`

- [ ] **Step 3: Commit**

```bash
git add .actor/input_schema.json .actor/dataset_schema.json
git commit -m "feat: update input/dataset schemas for new fields"
```

---

### Task 10: Run All Tests and Verify Coverage

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npm run test
```

Expected: All tests PASS.

- [ ] **Step 2: Run coverage**

```bash
cd /Users/reggie/reggie_coding_space/threads-feed-scraper && npm run test:coverage
```

Expected: 80%+ coverage on src/ (excluding main.ts).

- [ ] **Step 3: Fix any coverage gaps if below 80%**

Add additional tests as needed for uncovered branches.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test: achieve 80%+ coverage across all modules"
```

---

## Summary

| Task | Feature | Category |
|------|---------|----------|
| 1 | Vitest coverage setup | Infrastructure |
| 2 | Extended types | Phase 1 |
| 3 | Timestamp normalization | Phase 1 |
| 4 | URL builders (profile, post, sort) | Phase 1 + 2 |
| 5 | Input validation | Phase 1 + 2 |
| 6 | Media extraction, views, quotes | Phase 1 + 2 |
| 7 | Reply extraction | Phase 2 |
| 8 | Main wiring | Phase 1 + 2 |
| 9 | Actor schemas | Phase 1 + 2 |
| 10 | Coverage verification | Testing |
