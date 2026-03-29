export type SourceType = 'feed' | 'search' | 'tag';

export interface ThreadsPost {
    postId: string;
    author: string;
    content: string;
    publishedAt: string;
    likeCount: number;
    replyCount: number;
    repostCount: number;
    shareCount: number;
    postUrl: string;
    sourceType: SourceType;
    sourceQuery: string;
    scrapedAt: string;
}

export interface InputSchema {
    feedUrls?: string[];
    searchKeywords?: string[];
    searchTags?: string[];
    maxPosts?: number;
    scrollCount?: number;
}
