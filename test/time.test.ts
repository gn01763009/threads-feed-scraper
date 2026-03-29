import { describe, expect, it } from 'vitest';
import { normalizeTimestamp } from '../src/time.js';

describe('normalizeTimestamp', () => {
    it('converts relative minutes "30m" to ISO string', () => {
        const result = normalizeTimestamp('30m');
        const parsed = new Date(result);
        expect(parsed.getTime()).not.toBeNaN();
        const diffMs = Date.now() - parsed.getTime();
        expect(diffMs).toBeGreaterThan(29 * 60 * 1000);
        expect(diffMs).toBeLessThan(31 * 60 * 1000);
    });

    it('converts relative hours "5h" to ISO string', () => {
        const result = normalizeTimestamp('5h');
        const parsed = new Date(result);
        const diffMs = Date.now() - parsed.getTime();
        expect(diffMs).toBeGreaterThan(4.9 * 60 * 60 * 1000);
        expect(diffMs).toBeLessThan(5.1 * 60 * 60 * 1000);
    });

    it('converts relative days "5d" to ISO string', () => {
        const result = normalizeTimestamp('5d');
        const parsed = new Date(result);
        const diffMs = Date.now() - parsed.getTime();
        expect(diffMs).toBeGreaterThan(4.9 * 24 * 60 * 60 * 1000);
        expect(diffMs).toBeLessThan(5.1 * 24 * 60 * 60 * 1000);
    });

    it('converts relative weeks "2w" to ISO string', () => {
        const result = normalizeTimestamp('2w');
        const parsed = new Date(result);
        const diffMs = Date.now() - parsed.getTime();
        expect(diffMs).toBeGreaterThan(13.9 * 24 * 60 * 60 * 1000);
        expect(diffMs).toBeLessThan(14.1 * 24 * 60 * 60 * 1000);
    });

    it('converts absolute date "03/04/26" (MM/DD/YY) to ISO string', () => {
        const result = normalizeTimestamp('03/04/26');
        expect(result).toBe('2026-03-04T00:00:00.000Z');
    });

    it('converts absolute date "12/25/25" to ISO string', () => {
        const result = normalizeTimestamp('12/25/25');
        expect(result).toBe('2025-12-25T00:00:00.000Z');
    });

    it('returns empty string for empty input', () => {
        expect(normalizeTimestamp('')).toBe('');
    });

    it('returns empty string for unrecognized format', () => {
        expect(normalizeTimestamp('yesterday')).toBe('');
    });

    it('handles "1s" (seconds)', () => {
        const result = normalizeTimestamp('1s');
        const parsed = new Date(result);
        const diffMs = Date.now() - parsed.getTime();
        expect(diffMs).toBeLessThan(5 * 1000);
    });
});
