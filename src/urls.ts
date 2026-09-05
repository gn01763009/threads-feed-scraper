import type { SearchSort } from './types.js';

const THREADS_SEARCH_BASE = 'https://www.threads.com/search';
const THREADS_BASE = 'https://www.threads.com';

/**
 * "Recent" is a `serp_type`, not a `filter`.
 *
 * The old `serp_type=default&filter=recent` looked plausible and returned a page, but measured
 * against plain `default` it repeated 8 of its 15 posts — the filter was largely ignored, so
 * `searchSort: 'recent'` was quietly delivering the top-ranked feed. `serp_type=recent` returns
 * a set with *zero* overlap with `default`, which is what a separate tab should look like.
 */
export function buildSearchUrl(keyword: string, sort?: SearchSort): string {
    const url = new URL(THREADS_SEARCH_BASE);
    url.searchParams.set('q', keyword);
    url.searchParams.set('serp_type', sort === 'recent' ? 'recent' : 'default');
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
