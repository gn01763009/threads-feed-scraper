import type { InputSchema } from './types.js';

export function validateInput(raw: InputSchema | null | undefined): InputSchema {
    if (!raw) {
        throw new Error('Input is required');
    }

    const feedUrls = filterNonEmpty(raw.feedUrls);
    const searchKeywords = filterNonEmpty(raw.searchKeywords);
    const searchTags = filterNonEmpty(raw.searchTags);

    if (feedUrls.length === 0 && searchKeywords.length === 0 && searchTags.length === 0) {
        throw new Error(
            'At least one of feedUrls, searchKeywords, or searchTags must be provided',
        );
    }

    for (const url of feedUrls) {
        try {
            const parsed = new URL(url);
            if (!['threads.com', 'www.threads.com'].includes(parsed.hostname)) {
                throw new Error(`Invalid feed URL (must be threads.com): ${url}`);
            }
        } catch {
            throw new Error(`Invalid feed URL: ${url}`);
        }
    }

    return {
        feedUrls: feedUrls.length > 0 ? feedUrls : undefined,
        searchKeywords: searchKeywords.length > 0 ? searchKeywords : undefined,
        searchTags: searchTags.length > 0 ? searchTags : undefined,
        maxPosts: raw.maxPosts,
        scrollCount: raw.scrollCount,
    };
}

function filterNonEmpty(arr: string[] | undefined): string[] {
    if (!arr) return [];
    return arr.map((s) => s.trim()).filter((s) => s.length > 0);
}
