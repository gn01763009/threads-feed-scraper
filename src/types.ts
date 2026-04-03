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
