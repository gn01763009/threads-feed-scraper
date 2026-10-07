/**
 * Graceful-stop watchdog.
 *
 * A run that hits its timeout is killed with no say in what happens next: the customer's run is
 * TIMED-OUT and the log ends mid-sentence. Apify tells the actor when that will happen
 * (ACTOR_TIMEOUT_AT), so the actor can stop *starting* work a little earlier, push what it has,
 * say why in the log and the status message, and finish as SUCCEEDED with a partial dataset.
 *
 * Nothing here interrupts anything. Callers ask `shouldStop()` before beginning each new source,
 * query form or attempt; work already in flight is left to finish, which is what the margin pays for.
 */

/** The monorepo canary greps run logs for this marker to flag a run whose data is partial. */
export const INCOMPLETE_MARKER = '[incomplete-data]';

/** One slow HTTP request is 30 s (see src/ssr.ts) and the push after it needs a moment too. */
export const MIN_MARGIN_MS = 45_000;
const MARGIN_FRACTION = 0.1;

export interface Watchdog {
    /** Epoch ms after which no new work should start; undefined when the platform gave no timeout. */
    softDeadlineMs: number | undefined;
    /** Whole-run timeout in seconds, if known — logged at start for later debugging. */
    totalTimeoutSecs: number | undefined;
    shouldStop: () => boolean;
}

function parseTime(value: string | undefined): number | undefined {
    if (value === undefined || value.trim() === '') return undefined;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? undefined : ms;
}

/**
 * soft deadline = timeoutAt - max(45 s, 10% of the whole run's time).
 * `startedAt` falls back to `now`, which under-states the total and so can only make the margin smaller.
 */
export function createWatchdog(opts: {
    timeoutAt: string | undefined;
    startedAt: string | undefined;
    now: () => number;
}): Watchdog {
    const timeoutAtMs = parseTime(opts.timeoutAt);
    if (timeoutAtMs === undefined) {
        return { softDeadlineMs: undefined, totalTimeoutSecs: undefined, shouldStop: () => false };
    }

    const startedAtMs = parseTime(opts.startedAt) ?? opts.now();
    const totalMs = Math.max(0, timeoutAtMs - startedAtMs);
    const marginMs = Math.max(MIN_MARGIN_MS, totalMs * MARGIN_FRACTION);
    const softDeadlineMs = timeoutAtMs - marginMs;

    return {
        softDeadlineMs,
        totalTimeoutSecs: Math.round(totalMs / 1000),
        shouldStop: () => opts.now() >= softDeadlineMs,
    };
}

export interface IncompleteReport {
    processed: number;
    total: number;
    pushed: number;
}

/** The single log line. Format is a contract with the monorepo canary: marker first, then the reason. */
export function formatIncompleteLog(r: IncompleteReport): string {
    return (
        `${INCOMPLETE_MARKER} Stopped before the run timeout — ${r.processed} of ${r.total} sources processed, ` +
        `${r.pushed} posts pushed; increase the run timeout or reduce sources/maxPosts.`
    );
}

/** Status message shown on the run. Traditional Chinese listings read Chinese first, the rest English first. */
export function formatIncompleteStatus(r: IncompleteReport, zhFirst: boolean): string {
    const en = `Stopped before the run timeout: ${r.processed}/${r.total} sources, ${r.pushed} posts pushed. Increase the run timeout or reduce sources/maxPosts.`;
    const zh = `因接近執行逾時而提前結束：已處理 ${r.processed}/${r.total} 個來源，共 ${r.pushed} 筆。請調高執行逾時，或減少來源數／maxPosts。`;
    return zhFirst ? `${zh} | ${en}` : `${en} | ${zh}`;
}

/** Actors whose Store listing is Traditional Chinese (threads-feed-scraper, threads-stock-sentiment). */
export const ZH_FIRST_ACTOR_IDS: readonly string[] = ['gYxIBYI7YR97txviU', '2FBzCBI8jc8uYwAGW'];

export function isZhFirstActor(actorId: string | undefined | null): boolean {
    return actorId != null && ZH_FIRST_ACTOR_IDS.includes(actorId);
}
