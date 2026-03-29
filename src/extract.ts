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
    return '(() => {\n'
        + '    const results = [];\n'
        + '    const seen = new Set();\n'
        + '\n'
        + '    let containers = document.querySelectorAll(\'[data-pressable-container="true"]\');\n'
        + '\n'
        + '    if (containers.length === 0) {\n'
        + '        containers = document.querySelectorAll(\'div[role="article"], article\');\n'
        + '    }\n'
        + '\n'
        + '    if (containers.length === 0) {\n'
        + '        const postLinks = document.querySelectorAll(\'a[href*="/post/"]\');\n'
        + '        const parentSet = new Set();\n'
        + '        postLinks.forEach(link => {\n'
        + '            let parent = link.parentElement;\n'
        + '            for (let i = 0; i < 5 && parent; i++) {\n'
        + '                if (parent.children.length > 2) {\n'
        + '                    parentSet.add(parent);\n'
        + '                    break;\n'
        + '                }\n'
        + '                parent = parent.parentElement;\n'
        + '            }\n'
        + '        });\n'
        + '        containers = Array.from(parentSet);\n'
        + '    }\n'
        + '\n'
        + '    const scrapedAt = new Date().toISOString();\n'
        + '\n'
        + '    const parseCount = (raw) => {\n'
        + '        if (!raw) return 0;\n'
        + '        const cleaned = raw.replace(/,/g, \'\');\n'
        + '        const kMatch = cleaned.match(/^([\\\\d.]+)K$/i);\n'
        + '        if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);\n'
        + '        const mMatch = cleaned.match(/^([\\\\d.]+)M$/i);\n'
        + '        if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);\n'
        + '        return parseInt(cleaned, 10) || 0;\n'
        + '    };\n'
        + '\n'
        + '    const RELATIVE_PATTERN = /^(\\\\d+)([smhdw])$/i;\n'
        + '    const ABSOLUTE_PATTERN = /^(\\\\d{2})\\\\/(\\\\d{2})\\\\/(\\\\d{2})$/;\n'
        + '    const UNIT_TO_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };\n'
        + '\n'
        + '    const normalizeTimestamp = (raw) => {\n'
        + '        if (!raw) return \'\';\n'
        + '        const trimmed = raw.trim();\n'
        + '        if (!trimmed) return \'\';\n'
        + '        const relMatch = trimmed.match(RELATIVE_PATTERN);\n'
        + '        if (relMatch) {\n'
        + '            const val = parseInt(relMatch[1], 10);\n'
        + '            const unit = relMatch[2].toLowerCase();\n'
        + '            const ms = UNIT_TO_MS[unit];\n'
        + '            if (ms) return new Date(Date.now() - val * ms).toISOString();\n'
        + '        }\n'
        + '        const absMatch = trimmed.match(ABSOLUTE_PATTERN);\n'
        + '        if (absMatch) {\n'
        + '            return new Date(\'20\' + absMatch[3] + \'-\' + absMatch[1] + \'-\' + absMatch[2] + \'T00:00:00.000Z\').toISOString();\n'
        + '        }\n'
        + '        return \'\';\n'
        + '    };\n'
        + '\n'
        + '    const detectMediaType = (imageUrls, videoUrls) => {\n'
        + '        const total = imageUrls.length + videoUrls.length;\n'
        + '        if (total === 0) return \'text\';\n'
        + '        if (total > 1) return \'carousel\';\n'
        + '        if (videoUrls.length > 0) return \'video\';\n'
        + '        return \'photo\';\n'
        + '    };\n'
        + '\n'
        + '    for (const el of containers) {\n'
        + '        if (results.length >= ' + maxPosts + ') break;\n'
        + '\n'
        + '        const textContent = (el.textContent || \'\').trim();\n'
        + '        if (textContent.length < 10) continue;\n'
        + '\n'
        + '        const postLink = el.querySelector(\'a[href*="/post/"]\');\n'
        + '        const postUrl = postLink ? postLink.href : \'\';\n'
        + '\n'
        + '        const postIdMatch = postUrl.match(/\\\\/post\\\\/([A-Za-z0-9_-]+)/);\n'
        + '        const postId = postIdMatch ? postIdMatch[1] : \'unknown_\' + results.length;\n'
        + '\n'
        + '        if (seen.has(postId)) continue;\n'
        + '        seen.add(postId);\n'
        + '\n'
        + '        const authorLink = el.querySelector(\'a[href^="/@"]\');\n'
        + '        let author = \'unknown\';\n'
        + '        if (authorLink) {\n'
        + '            const linkText = (authorLink.textContent || \'\').trim();\n'
        + '            if (linkText) {\n'
        + '                author = linkText;\n'
        + '            } else if (authorLink.href) {\n'
        + '                const m = authorLink.href.match(/@([^/?]+)/);\n'
        + '                if (m) author = m[1];\n'
        + '            }\n'
        + '        }\n'
        + '\n'
        + '        const timeEl = el.querySelector(\'time\');\n'
        + '        const publishedAt = timeEl ? (timeEl.textContent || \'\').trim() : \'\';\n'
        + '        const publishedAtISO = normalizeTimestamp(publishedAt);\n'
        + '\n'
        + '        const spans = el.querySelectorAll(\'span\');\n'
        + '        let content = \'\';\n'
        + '        for (const s of spans) {\n'
        + '            const t = (s.textContent || \'\').trim();\n'
        + '            if (t.length > 20 && t !== author && !/^\\\\d+[hmd]$/.test(t)) {\n'
        + '                content = t;\n'
        + '                break;\n'
        + '            }\n'
        + '        }\n'
        + '\n'
        + '        if (!content) {\n'
        + '            content = textContent.slice(0, 500);\n'
        + '        }\n'
        + '\n'
        + '        const images = el.querySelectorAll(\'img[src]\');\n'
        + '        const videos = el.querySelectorAll(\'video source[src], video[src]\');\n'
        + '        const imageUrls = [];\n'
        + '        const videoUrls = [];\n'
        + '\n'
        + '        for (const img of images) {\n'
        + '            const src = img.src || \'\';\n'
        + '            if (src && !src.includes(\'profile\') && !src.includes(\'icon\') && !src.includes(\'emoji\')) {\n'
        + '                imageUrls.push(src);\n'
        + '            }\n'
        + '        }\n'
        + '\n'
        + '        for (const vid of videos) {\n'
        + '            const src = vid.src || \'\';\n'
        + '            if (src) {\n'
        + '                videoUrls.push(src);\n'
        + '            }\n'
        + '        }\n'
        + '\n'
        + '        const mediaType = detectMediaType(imageUrls, videoUrls);\n'
        + '        const mediaUrls = [\n'
        + '            ...imageUrls.map(u => ({ url: u, type: \'image\' })),\n'
        + '            ...videoUrls.map(u => ({ url: u, type: \'video\' })),\n'
        + '        ];\n'
        + '\n'
        + '        const buttons = el.querySelectorAll(\'[role="button"]\');\n'
        + '        const engagement = { like: 0, comment: 0, repost: 0, share: 0, view: 0, quote: 0 };\n'
        + '\n'
        + '        for (const btn of buttons) {\n'
        + '            const btnText = (btn.textContent || \'\').trim();\n'
        + '            const countMatch = btnText.match(/^(?:Like|Comment|Repost|Share|View|Quote)([\\\\d.,]+[KkMm]?)$/);\n'
        + '            if (!countMatch) continue;\n'
        + '            const count = parseCount(countMatch[1]);\n'
        + '            if (btnText.startsWith(\'Like\')) engagement.like = count;\n'
        + '            else if (btnText.startsWith(\'Comment\')) engagement.comment = count;\n'
        + '            else if (btnText.startsWith(\'Repost\')) engagement.repost = count;\n'
        + '            else if (btnText.startsWith(\'Share\')) engagement.share = count;\n'
        + '            else if (btnText.startsWith(\'View\')) engagement.view = count;\n'
        + '            else if (btnText.startsWith(\'Quote\')) engagement.quote = count;\n'
        + '        }\n'
        + '\n'
        + '        results.push({\n'
        + '            postId,\n'
        + '            author,\n'
        + '            content,\n'
        + '            publishedAt,\n'
        + '            publishedAtISO,\n'
        + '            likeCount: engagement.like,\n'
        + '            replyCount: engagement.comment,\n'
        + '            repostCount: engagement.repost,\n'
        + '            shareCount: engagement.share,\n'
        + '            viewCount: engagement.view,\n'
        + '            quoteCount: engagement.quote,\n'
        + '            mediaType,\n'
        + '            mediaUrls,\n'
        + '            postUrl,\n'
        + '            sourceType: ' + JSON.stringify(sourceType) + ',\n'
        + '            sourceQuery: ' + JSON.stringify(sourceQuery) + ',\n'
        + '            scrapedAt,\n'
        + '            replies: [],\n'
        + '        });\n'
        + '    }\n'
        + '\n'
        + '    return results;\n'
        + '})()';
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
