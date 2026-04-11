/**
 * Browser-side extraction logic and shared pure functions.
 */

import type { MediaType, SourceType } from './types.js';

/** Parse engagement count strings like "1.7K", "3.2M", "1,234" to number */
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
 * This is a self-contained IIFE injected into page.evaluate().
 * It duplicates parseCount/detectMediaType/normalizeTimestamp inline
 * because the browser context cannot import Node modules.
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
                // Try shorter spans (some posts have very short text)
                for (const s of spans) {
                    const t = (s.textContent || '').trim();
                    // Strip author name to check if there's real content left
                    const stripped = t.replace(new RegExp(author.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'g'), '').trim();
                    if (t.length > 1 && t !== author && !/^\\d+[smhdw]$/.test(t)
                        && !/(Like|Comment|Repost|Share|View|Quote)\\d/.test(t)
                        && !/Audio is/.test(t) && !/Verified/.test(t)
                        && !/^Follow$/.test(t)
                        && !/^\\d{2}\\/\\d{2}\\/\\d{2}$/.test(t)
                        && stripped.length > 0) {
                        content = t;
                        break;
                    }
                }
            }

            if (!content) {
                // Final fallback: strip UI artifacts from raw text
                const cleaned = textContent
                    .replace(new RegExp(author.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&'), 'g'), '')
                    .replace(/\\d+[smhdw]\\b/g, '')
                    .replace(/(Like|Comment|Repost|Share|View|Quote)\\d[\\d.,]*[KkMm]?/g, '')
                    .replace(/Audio is (muted|on)/g, '')
                    .replace(/Verified/g, '')
                    .replace(/Follow/g, '')
                    .replace(/\\s+/g, ' ')
                    .trim();
                content = cleaned.length > 0 ? cleaned.slice(0, 500) : '';
            }

            const images = el.querySelectorAll('img[src]');
            const videos = el.querySelectorAll('video source[src], video[src]');
            const imageUrls = [];
            const videoUrls = [];

            for (const img of images) {
                const src = img.src || '';
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
                const countMatch = btnText.match(/(Like|Comment|Repost|Share|View|Quote)(\\d[\\d.,]*[KkMm]?)/);
                if (!countMatch) continue;
                const count = parseCount(countMatch[2]);
                if (countMatch[1] === 'Like') engagement.like = count;
                else if (countMatch[1] === 'Comment') engagement.comment = count;
                else if (countMatch[1] === 'Repost') engagement.repost = count;
                else if (countMatch[1] === 'Share') engagement.share = count;
                else if (countMatch[1] === 'View') engagement.view = count;
                else if (countMatch[1] === 'Quote') engagement.quote = count;
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

export const DEBUG_SCRIPT = `
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
`;
