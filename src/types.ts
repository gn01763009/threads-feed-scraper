export type Mode = 'user' | 'hashtag' | 'search' | 'post' | 'feed';

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

export interface ThreadPart {
    postId: string;
    content: string;
    postUrl: string;
    mediaUrls: ThreadsMedia[];
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
    threadParts?: ThreadPart[];
}

/**
 * Raw input as received from Apify. All fields optional; legacy field
 * names are accepted for backwards-compatibility with v0.3 saved inputs.
 */
export interface RawInput {
    mode?: Mode;
    usernames?: string[];
    bulkUsernames?: string;
    keywords?: string[];
    bulkKeywords?: string;
    postUrls?: string[];
    feedUrls?: string[];
    searchSort?: SearchSort;
    dateFrom?: string;
    dateTo?: string;
    maxPosts?: number;
    scrollCount?: number;
    /** Apify proxy settings. Absent means "no proxy", which shares Apify's egress IPs. */
    proxyConfiguration?: { useApifyProxy?: boolean; apifyProxyGroups?: string[]; apifyProxyCountry?: string };

    // Legacy v0.3 fields — auto-migrated in validation
    profileUrls?: string[];
    searchKeywords?: string[];
    searchTags?: string[];
}

/** Normalized, validated input ready for the crawler. */
export interface NormalizedInput {
    mode: Mode;
    usernames: string[];
    keywords: string[];
    postUrls: string[];
    feedUrls: string[];
    searchSort?: SearchSort;
    dateFrom?: string;
    dateTo?: string;
    maxPosts: number;
    scrollCount: number;
    proxyConfiguration?: { useApifyProxy?: boolean; apifyProxyGroups?: string[]; apifyProxyCountry?: string };
}
