import { describe, expect, it } from 'vitest';
import { getReplyExtractScript } from '../src/replies.js';

describe('getReplyExtractScript', () => {
    it('returns a non-empty string', () => {
        const script = getReplyExtractScript(10);
        expect(typeof script).toBe('string');
        expect(script.length).toBeGreaterThan(0);
    });

    it('embeds maxReplies in the script', () => {
        const script = getReplyExtractScript(25);
        expect(script).toContain('25');
    });
});
