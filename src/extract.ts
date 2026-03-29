/**
 * Browser-side extraction logic.
 * This is passed as a string to page.evaluate() to avoid tsx transpiler
 * injecting Node-side helpers (__name) into the browser context.
 */

export interface ThreadsPost {
    postId: string;
    author: string;
    content: string;
    likeCount: number;
    replyCount: number;
    postUrl: string;
    scrapedAt: string;
    feedUrl: string;
}

/**
 * Returns a serialized JS function string for page.evaluate().
 * This avoids the tsx __name injection issue.
 */
export function getExtractScript(maxPosts: number, feedUrl: string): string {
    return `
    (() => {
        const results = [];
        const seen = new Set();

        // Strategy 1: data-pressable-container divs (Threads' common pattern)
        let containers = document.querySelectorAll('[data-pressable-container="true"]');

        // Strategy 2: fallback to article elements
        if (containers.length === 0) {
            containers = document.querySelectorAll('div[role="article"], article');
        }

        // Strategy 3: broader fallback — look for link containers with /post/
        if (containers.length === 0) {
            const postLinks = document.querySelectorAll('a[href*="/post/"]');
            const parentSet = new Set();
            postLinks.forEach(link => {
                // Walk up to find a reasonable container
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

        for (const el of containers) {
            if (results.length >= ${maxPosts}) break;

            const textContent = (el.textContent || '').trim();
            if (textContent.length < 10) continue;

            // Find the post link
            const postLink = el.querySelector('a[href*="/post/"]');
            const postUrl = postLink ? postLink.href : '';

            // Extract post ID from URL
            const postIdMatch = postUrl.match(/\\/post\\/([A-Za-z0-9_-]+)/);
            const postId = postIdMatch ? postIdMatch[1] : 'unknown_' + results.length;

            if (seen.has(postId)) continue;
            seen.add(postId);

            // Find author
            const authorLink = el.querySelector('a[href^="/@"]');
            let author = 'unknown';
            if (authorLink) {
                author = authorLink.textContent ? authorLink.textContent.trim() : 'unknown';
                if (author === 'unknown' && authorLink.href) {
                    const m = authorLink.href.match(/@([^/?]+)/);
                    if (m) author = m[1];
                }
            }

            // Find the main text content
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

            // Find engagement counts
            const allText = el.textContent || '';
            const likeMatch = allText.match(/(\\d[\\d,.]*)\\s*(?:like|讚)/i);
            const replyMatch = allText.match(/(\\d[\\d,.]*)\\s*(?:repl|回覆|留言)/i);

            const parseCount = (m) => {
                if (!m) return 0;
                return parseInt(m[1].replace(/[,.]/g, ''), 10) || 0;
            };

            results.push({
                postId: postId,
                author: author,
                content: content,
                likeCount: parseCount(likeMatch),
                replyCount: parseCount(replyMatch),
                postUrl: postUrl,
                scrapedAt: new Date().toISOString(),
                feedUrl: ${JSON.stringify(feedUrl)},
            });
        }

        return results;
    })()
    `;
}

export function getDebugScript(): string {
    return `
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
}
