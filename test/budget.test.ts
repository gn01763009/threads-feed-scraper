import { describe, expect, it } from 'vitest';

import { createRunBudget, parseRunLimit, pushWithinBudget } from '../src/budget.js';

describe('parseRunLimit', () => {
    it('returns undefined when unset or unusable', () => {
        for (const v of [undefined, '', '  ', 'abc', '0', '-3', '2.5']) {
            expect(parseRunLimit(v)).toBeUndefined();
        }
    });

    it('parses a positive integer', () => {
        expect(parseRunLimit('5')).toBe(5);
    });
});

describe('createRunBudget', () => {
    it('lets everything through when there is no limit', () => {
        const budget = createRunBudget(undefined);
        expect(budget.take([1, 2, 3])).toEqual([1, 2, 3]);
        expect(budget.isExhausted()).toBe(false);
    });

    it('never hands out more than the limit across several takes', () => {
        const budget = createRunBudget(5);
        const first = budget.take([1, 2, 3]);
        const second = budget.take([4, 5, 6, 7]);
        const third = budget.take([8]);
        expect([...first, ...second, ...third]).toEqual([1, 2, 3, 4, 5]);
        expect(budget.isExhausted()).toBe(true);
    });

    it('does not mutate its input', () => {
        const budget = createRunBudget(1);
        const input = [1, 2, 3];
        budget.take(input);
        expect(input).toEqual([1, 2, 3]);
    });
});

describe('pushWithinBudget', () => {
    it('pushes exactly the rows it reports, never above the limit', async () => {
        const pushed: number[] = [];
        const budget = createRunBudget(5);
        const push = async (rows: number[]) => {
            pushed.push(...rows);
        };

        const a = await pushWithinBudget(budget, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], push);
        const b = await pushWithinBudget(budget, [20, 21], push);

        expect(a).toBe(5);
        expect(b).toBe(0);
        expect(pushed).toHaveLength(a + b);
        expect(pushed.length).toBeLessThanOrEqual(5);
    });

    it('does not call push for an empty remainder', async () => {
        let calls = 0;
        const budget = createRunBudget(1);
        await pushWithinBudget(budget, [1], async () => {
            calls++;
        });
        await pushWithinBudget(budget, [2], async () => {
            calls++;
        });
        expect(calls).toBe(1);
    });
});
