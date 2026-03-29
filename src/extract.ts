/**
 * Browser-side extraction logic.
 * These are passed as strings to page.evaluate() to avoid tsx transpiler
 * injecting Node-side helpers (__name) into the browser context.
 */

import type { SourceType } from './types.js';

/**
 * Shared post-extraction logic injected into page.evaluate() strings.
 * Finds post containers, extracts metadata, engagement counts, and returns results.
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
                content = textContent.slice(0, 500);
            }

            const buttons = el.querySelectorAll('[role="button"]');
            const engagement = { like: 0, comment: 0, repost: 0, share: 0 };

            for (const btn of buttons) {
                const btnText = (btn.textContent || '').trim();
                const countMatch = btnText.match(/^(?:Like|Comment|Repost|Share)([\\d.,]+[KkMm]?)$/);
                if (!countMatch) continue;
                const count = parseCount(countMatch[1]);
                if (btnText.startsWith('Like')) engagement.like = count;
                else if (btnText.startsWith('Comment')) engagement.comment = count;
                else if (btnText.startsWith('Repost')) engagement.repost = count;
                else if (btnText.startsWith('Share')) engagement.share = count;
            }

            results.push({
                postId,
                author,
                content,
                publishedAt,
                likeCount: engagement.like,
                replyCount: engagement.comment,
                repostCount: engagement.repost,
                shareCount: engagement.share,
                postUrl,
                sourceType: ${JSON.stringify(sourceType)},
                sourceQuery: ${JSON.stringify(sourceQuery)},
                scrapedAt,
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
