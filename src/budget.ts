/**
 * Run-level item budget.
 *
 * `maxPosts` caps each source (one username, one keyword, one post). On a pay-per-event run the
 * platform also hands the actor a hard ceiling for the whole run in ACTOR_MAX_PAID_DATASET_ITEMS
 * (set from the caller's "max items" run option or their spending limit). Every pushed row is
 * charged, so a row pushed past that ceiling is a row the caller never agreed to pay for.
 *
 * `take` returns only the rows that still fit and spends them, so what gets pushed is exactly
 * what gets charged. The budget is the only place that counts; callers never subtract by hand.
 */

export interface RunBudget {
    /** Rows from `items` that still fit in the budget (a new array; `items` is untouched). */
    take: <T>(items: readonly T[]) => T[];
    /** True once nothing more may be pushed — callers use it to stop fetching. */
    isExhausted: () => boolean;
}

/** Parse ACTOR_MAX_PAID_DATASET_ITEMS. Unset, empty, non-numeric or non-positive means "no ceiling". */
export function parseRunLimit(value: string | undefined): number | undefined {
    if (value === undefined || value.trim() === '') return undefined;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function createRunBudget(limit: number | undefined): RunBudget {
    let remaining = limit ?? Number.POSITIVE_INFINITY;
    return {
        take: <T>(items: readonly T[]): T[] => {
            const fitting = items.slice(0, remaining);
            remaining -= fitting.length;
            return fitting;
        },
        isExhausted: () => remaining <= 0,
    };
}

/**
 * Push the rows that fit in the budget and return how many were pushed. Nothing is pushed for an
 * empty remainder, so the count returned is also the count the platform charges for.
 */
export async function pushWithinBudget<T>(
    budget: RunBudget,
    items: readonly T[],
    push: (rows: T[]) => Promise<void>,
): Promise<number> {
    const rows = budget.take(items);
    if (rows.length === 0) return 0;
    await push(rows);
    return rows.length;
}
