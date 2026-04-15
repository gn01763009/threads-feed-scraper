#!/usr/bin/env tsx
/**
 * Revenue & activity report across all Apify Store listings.
 *
 * Usage: tsx scripts/revenue-report.ts [--days 30]
 *
 * Fetches:
 *  - Runs per actor in the last N days (status, userId, datasetId)
 *  - Dataset item counts for each run (to compute results & estimated revenue)
 *
 * Estimated revenue = total dataset items × $0.005 per result.
 *
 * Token source: ~/.apify/auth.json (written by `apify login`).
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

// ── Config ───────────────────────────────────────────────────────────────────

const PRICE_PER_RESULT_USD = 0.005;
const MAX_RUNS_PER_ACTOR = 500; // cap to avoid huge pagination

const LOCALES: { locale: string; actorId: string; title: string }[] = [
    { locale: 'zh-tw', actorId: 'gYxIBYI7YR97txviU', title: 'Meta Threads 爬蟲 (zh-TW)' },
    { locale: 'en', actorId: 'gnvZoX4vwrEze1dos', title: 'Threads Scraper (EN)' },
    { locale: 'pt-br', actorId: 'n8Bf8q0wtO0Pwwxuj', title: 'Threads Scraper (PT-BR)' },
    { locale: 'ja', actorId: 'NirQxxKuNimRK3Ae4', title: 'Threadsスクレイパー (JA)' },
    { locale: 'vi', actorId: 'NEziwa5cuMejscm2W', title: 'Threads Scraper (VI)' },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface RunItem {
    id: string;
    status: string;
    startedAt: string;
    userId: string;
    defaultDatasetId: string;
    usageTotalUsd: number;
}

interface RunsResponse {
    data: { items: RunItem[] };
}

interface DatasetResponse {
    data: { itemCount: number };
}

interface ActorStats {
    locale: string;
    title: string;
    totalRuns: number;
    succeededRuns: number;
    failedRuns: number;
    uniqueUsers: number;
    totalItems: number;
    estimatedRevenueUsd: number;
}

// ── API helpers ───────────────────────────────────────────────────────────────

function getToken(): string {
    const authPath = resolve(homedir(), '.apify', 'auth.json');
    const auth = JSON.parse(readFileSync(authPath, 'utf8')) as { token?: string };
    if (!auth.token) throw new Error(`No token in ${authPath}. Run \`apify login\` first.`);
    return auth.token;
}

async function apifyGet<T>(path: string, token: string): Promise<T> {
    const res = await fetch(`https://api.apify.com/v2${path}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Apify API ${res.status} for ${path}: ${body}`);
    }
    return res.json() as Promise<T>;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchRunsInWindow(
    actorId: string,
    token: string,
    cutoff: Date,
): Promise<RunItem[]> {
    const params = new URLSearchParams({
        desc: '1',
        limit: String(MAX_RUNS_PER_ACTOR),
    });
    const data = await apifyGet<RunsResponse>(
        `/acts/${actorId}/runs?${params}`,
        token,
    );
    return data.data.items.filter(r => new Date(r.startedAt) >= cutoff);
}

async function fetchItemCount(datasetId: string, token: string): Promise<number> {
    const data = await apifyGet<DatasetResponse>(`/datasets/${datasetId}`, token);
    return data.data.itemCount;
}

async function collectActorStats(
    actor: (typeof LOCALES)[number],
    token: string,
    cutoff: Date,
): Promise<ActorStats> {
    const runs = await fetchRunsInWindow(actor.actorId, token, cutoff);

    const succeeded = runs.filter(r => r.status === 'SUCCEEDED');
    const failed = runs.filter(r => !['SUCCEEDED', 'RUNNING', 'READY'].includes(r.status));
    const uniqueUsers = new Set(runs.map(r => r.userId)).size;

    // Fetch dataset item counts in parallel (only for succeeded runs with a dataset)
    const itemCounts = await Promise.all(
        succeeded
            .filter(r => r.defaultDatasetId)
            .map(r => fetchItemCount(r.defaultDatasetId, token).catch(() => 0)),
    );
    const totalItems = itemCounts.reduce((sum, n) => sum + n, 0);

    return {
        locale: actor.locale,
        title: actor.title,
        totalRuns: runs.length,
        succeededRuns: succeeded.length,
        failedRuns: failed.length,
        uniqueUsers,
        totalItems,
        estimatedRevenueUsd: totalItems * PRICE_PER_RESULT_USD,
    };
}

// ── Formatting ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
    return n.toLocaleString('en-US');
}

function fmtPct(a: number, b: number): string {
    if (b === 0) return '  —  ';
    return `${Math.round((a / b) * 100)}%`;
}

function fmtUsd(n: number): string {
    return `$${n.toFixed(2)}`;
}

function pad(s: string, w: number, right = false): string {
    return right ? s.padStart(w) : s.padEnd(w);
}

function printReport(stats: ActorStats[], days: number, cutoff: Date): void {
    const now = new Date();
    const divider = '─'.repeat(72);

    console.log(`\nRevenue & Activity Report — last ${days} days`);
    console.log(`${cutoff.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`);
    console.log(divider);

    const header = [
        pad('Locale', 7),
        pad('Runs', 6, true),
        pad('OK%', 6, true),
        pad('Failed', 7, true),
        pad('Users', 6, true),
        pad('Results', 9, true),
        pad('Est. Revenue', 13, true),
    ].join('  ');
    console.log(header);
    console.log(divider);

    let totalRuns = 0;
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalUsers = 0;
    let totalItems = 0;
    let totalRevenue = 0;

    for (const s of stats) {
        const row = [
            pad(s.locale, 7),
            pad(fmt(s.totalRuns), 6, true),
            pad(fmtPct(s.succeededRuns, s.totalRuns), 6, true),
            pad(fmt(s.failedRuns), 7, true),
            pad(fmt(s.uniqueUsers), 6, true),
            pad(fmt(s.totalItems), 9, true),
            pad(fmtUsd(s.estimatedRevenueUsd), 13, true),
        ].join('  ');
        console.log(row);
        console.log(`         ${s.title}`);

        totalRuns += s.totalRuns;
        totalSucceeded += s.succeededRuns;
        totalFailed += s.failedRuns;
        totalUsers += s.uniqueUsers; // note: same user across locales counts twice
        totalItems += s.totalItems;
        totalRevenue += s.estimatedRevenueUsd;
    }

    console.log(divider);
    const totRow = [
        pad('TOTAL', 7),
        pad(fmt(totalRuns), 6, true),
        pad(fmtPct(totalSucceeded, totalRuns), 6, true),
        pad(fmt(totalFailed), 7, true),
        pad(fmt(totalUsers), 6, true),
        pad(fmt(totalItems), 9, true),
        pad(fmtUsd(totalRevenue), 13, true),
    ].join('  ');
    console.log(totRow);
    console.log(divider);
    console.log(`\nNote: "Users" counts actor-slot calls, not deduplicated cross-locale.`);
    console.log(`      Est. Revenue = total results × $${PRICE_PER_RESULT_USD}/result.\n`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    const daysArg = process.argv.indexOf('--days');
    const days = daysArg !== -1 ? parseInt(process.argv[daysArg + 1] ?? '30', 10) : 30;
    if (isNaN(days) || days < 1) {
        console.error('Usage: tsx scripts/revenue-report.ts [--days 30]');
        process.exit(1);
    }

    const token = getToken();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    console.log(`Fetching stats for ${LOCALES.length} locales (last ${days} days)…`);

    const stats = await Promise.all(
        LOCALES.map(actor => collectActorStats(actor, token, cutoff)),
    );

    printReport(stats, days, cutoff);
}

main().catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
