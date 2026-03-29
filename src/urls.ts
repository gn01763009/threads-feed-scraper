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
