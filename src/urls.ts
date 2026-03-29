const THREADS_SEARCH_BASE = 'https://www.threads.com/search';

export function buildSearchUrl(keyword: string): string {
    const url = new URL(THREADS_SEARCH_BASE);
    url.searchParams.set('q', keyword);
    return url.toString();
}

export function buildTagUrl(tag: string): string {
    const cleaned = tag.startsWith('#') ? tag.slice(1) : tag;
    const url = new URL(THREADS_SEARCH_BASE);
    url.searchParams.set('q', cleaned);
    url.searchParams.set('serp_type', 'tags');
    return url.toString();
}
