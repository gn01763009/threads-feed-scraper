/**
 * Merge Threads "thread chain" parts (1/2, 2/2, etc.) into single posts.
 *
 * Threads splits long posts into multiple parts, each with its own postId.
 * On the profile page they appear as consecutive posts with:
 *   - Same author
 *   - Identical (or near-identical) timestamps
 *   - Post IDs that share a common prefix (≥ 4 chars)
 */

import type { ThreadsPost, ThreadPart } from './types.js';
import { detectMediaType } from './extract.js';

const MIN_PREFIX_LENGTH = 4;

function commonPrefixLength(a: string, b: string): number {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
}

function timestampsMatch(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    // Allow up to 10 seconds difference for relative timestamp rounding
    const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
    return diff <= 10_000;
}

function belongsToChain(head: ThreadsPost, candidate: ThreadsPost): boolean {
    return (
        candidate.author === head.author &&
        timestampsMatch(candidate.publishedAtISO, head.publishedAtISO) &&
        commonPrefixLength(candidate.postId, head.postId) >= MIN_PREFIX_LENGTH
    );
}

function mergeChain(unsorted: readonly ThreadsPost[]): ThreadsPost {
    // The main post (1/N) typically has the highest engagement.
    // Sort so it comes first, then the rest by postId for stable ordering.
    const chain = [...unsorted].sort((a, b) => {
        const engA = a.likeCount + a.replyCount + a.repostCount + a.shareCount;
        const engB = b.likeCount + b.replyCount + b.repostCount + b.shareCount;
        if (engA !== engB) return engB - engA; // highest engagement first
        return a.postId.localeCompare(b.postId);
    });

    const [head] = chain;

    const parts: ThreadPart[] = chain.map((p) => ({
        postId: p.postId,
        content: p.content,
        postUrl: p.postUrl,
        mediaUrls: p.mediaUrls,
    }));

    const mergedContent = chain.map((p) => p.content).join('\n\n');

    const seenUrls = new Set<string>();
    const imageUrls: string[] = [];
    const videoUrls: string[] = [];
    for (const p of chain) {
        for (const m of p.mediaUrls) {
            if (seenUrls.has(m.url)) continue;
            seenUrls.add(m.url);
            if (m.type === 'image') imageUrls.push(m.url);
            else videoUrls.push(m.url);
        }
    }
    const mergedMedia = [
        ...imageUrls.map((url) => ({ url, type: 'image' as const })),
        ...videoUrls.map((url) => ({ url, type: 'video' as const })),
    ];

    const totals = { like: 0, reply: 0, repost: 0, share: 0, view: 0, quote: 0 };
    for (const p of chain) {
        totals.like += p.likeCount;
        totals.reply += p.replyCount;
        totals.repost += p.repostCount;
        totals.share += p.shareCount;
        totals.view += p.viewCount;
        totals.quote += p.quoteCount;
    }

    return {
        ...head,
        content: mergedContent,
        mediaType: detectMediaType(imageUrls, videoUrls),
        mediaUrls: mergedMedia,
        likeCount: totals.like,
        replyCount: totals.reply,
        repostCount: totals.repost,
        shareCount: totals.share,
        viewCount: totals.view,
        quoteCount: totals.quote,
        threadParts: parts,
    };
}

export function mergeThreadChains(posts: readonly ThreadsPost[]): ThreadsPost[] {
    if (posts.length <= 1) return [...posts];

    // Sort by timestamp, then postId for stable ordering
    const sorted = [...posts].sort((a, b) => {
        const timeDiff = a.publishedAtISO.localeCompare(b.publishedAtISO);
        if (timeDiff !== 0) return timeDiff;
        return a.postId.localeCompare(b.postId);
    });

    const result: ThreadsPost[] = [];
    let i = 0;

    while (i < sorted.length) {
        const chain: ThreadsPost[] = [sorted[i]];

        while (i + 1 < sorted.length && belongsToChain(chain[0], sorted[i + 1])) {
            chain.push(sorted[i + 1]);
            i++;
        }

        result.push(chain.length > 1 ? mergeChain(chain) : chain[0]);
        i++;
    }

    return result;
}
