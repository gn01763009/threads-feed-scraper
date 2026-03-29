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
