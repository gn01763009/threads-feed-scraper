import { describe, expect, it } from 'vitest';
import { parseCount, detectMediaType } from '../src/extract.js';

describe('parseCount', () => {
    it('returns 0 for empty string', () => {
        expect(parseCount('')).toBe(0);
    });

    it('returns 0 for undefined', () => {
        expect(parseCount(undefined)).toBe(0);
    });

    it('parses plain number', () => {
        expect(parseCount('42')).toBe(42);
    });

    it('parses K suffix', () => {
        expect(parseCount('1.7K')).toBe(1700);
    });

    it('parses k suffix lowercase', () => {
        expect(parseCount('2.5k')).toBe(2500);
    });

    it('parses M suffix', () => {
        expect(parseCount('3.2M')).toBe(3200000);
    });

    it('handles commas', () => {
        expect(parseCount('1,234')).toBe(1234);
    });

    it('returns 0 for non-numeric', () => {
        expect(parseCount('abc')).toBe(0);
    });
});

describe('detectMediaType', () => {
    it('returns "text" when no media', () => {
        expect(detectMediaType([], [])).toBe('text');
    });

    it('returns "photo" for single image', () => {
        expect(detectMediaType(['img.jpg'], [])).toBe('photo');
    });

    it('returns "video" for single video', () => {
        expect(detectMediaType([], ['vid.mp4'])).toBe('video');
    });

    it('returns "carousel" for multiple images', () => {
        expect(detectMediaType(['a.jpg', 'b.jpg'], [])).toBe('carousel');
    });

    it('returns "carousel" for mixed media', () => {
        expect(detectMediaType(['a.jpg'], ['b.mp4'])).toBe('carousel');
    });
});
