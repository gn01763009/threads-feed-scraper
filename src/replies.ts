/**
 * Browser-side reply extraction script for single post pages.
 * Injected into page.evaluate() on post detail pages.
 */

export function getReplyExtractScript(maxReplies: number): string {
    return `
    (() => {
        const replies = [];
        const containers = document.querySelectorAll('[data-pressable-container="true"], div[role="article"], article');

        const replyContainers = Array.from(containers).slice(1);

        const parseCount = (raw) => {
            if (!raw) return 0;
            const cleaned = raw.replace(/,/g, '');
            const kMatch = cleaned.match(/^([\\d.]+)K$/i);
            if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000);
            const mMatch = cleaned.match(/^([\\d.]+)M$/i);
            if (mMatch) return Math.round(parseFloat(mMatch[1]) * 1000000);
            return parseInt(cleaned, 10) || 0;
        };

        for (const el of replyContainers) {
            if (replies.length >= ${maxReplies}) break;

            const textContent = (el.textContent || '').trim();
            if (textContent.length < 5) continue;

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
                if (t.length > 10 && t !== author && !/^\\d+[hmd]$/.test(t)) {
                    content = t;
                    break;
                }
            }

            if (!content) {
                content = textContent.slice(0, 500);
            }

            let likeCount = 0;
            const buttons = el.querySelectorAll('[role="button"]');
            for (const btn of buttons) {
                const btnText = (btn.textContent || '').trim();
                const countMatch = btnText.match(/^Like([\\d.,]+[KkMm]?)$/);
                if (countMatch) {
                    likeCount = parseCount(countMatch[1]);
                    break;
                }
            }

            replies.push({ author, content, publishedAt, likeCount });
        }

        return replies;
    })()
    `;
}
