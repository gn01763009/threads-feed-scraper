import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';

const PROJECT_ROOT = join(import.meta.dirname, '..');
const INPUT_PATH = join(PROJECT_ROOT, 'storage/key_value_stores/default/INPUT.json');
const DATASET_DIR = join(PROJECT_ROOT, 'storage/datasets/default');
const ACTOR_LOG_PATH = join(PROJECT_ROOT, 'storage/actor.log');

export function setInput(input: Record<string, unknown>): void {
    mkdirSync(dirname(INPUT_PATH), { recursive: true });
    writeFileSync(INPUT_PATH, JSON.stringify(input, null, 2));
}

export function clearDataset(): void {
    if (existsSync(DATASET_DIR)) {
        rmSync(DATASET_DIR, { recursive: true, force: true });
    }
}

export function runActor(): string {
    const result = spawnSync('npx', ['apify-cli', 'run'], {
        cwd: PROJECT_ROOT,
        timeout: 120_000,
        encoding: 'utf-8',
    });

    const combined = `--- stdout ---\n${result.stdout ?? ''}\n--- stderr ---\n${result.stderr ?? ''}\n--- exit: ${result.status} ---\n`;
    mkdirSync(dirname(ACTOR_LOG_PATH), { recursive: true });
    writeFileSync(ACTOR_LOG_PATH, combined);

    if (result.error || result.status !== 0) {
        process.stderr.write(`\n[runActor] apify-cli run failed (exit=${result.status}). Output:\n${combined}\n`);
        throw result.error ?? new Error(`apify-cli run exited with code ${result.status}`);
    }

    return result.stdout ?? '';
}

const APIFY_ACTOR_ID = 'claude_code_reviewer~threads-feed-scraper';

export async function runActorOnApifyCloud(
    input: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
    const token = process.env.APIFY_TOKEN;
    if (!token) {
        throw new Error('APIFY_TOKEN env var is required for cloud smoke runs');
    }

    const url = `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items?token=${token}&timeout=150&format=json`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });

    const text = await response.text();
    mkdirSync(dirname(ACTOR_LOG_PATH), { recursive: true });
    writeFileSync(
        ACTOR_LOG_PATH,
        `--- cloud run ---\nstatus: ${response.status}\nactor: ${APIFY_ACTOR_ID}\ninput: ${JSON.stringify(input)}\n--- response (first 4kb) ---\n${text.slice(0, 4096)}\n`,
    );

    if (!response.ok) {
        process.stderr.write(`\n[runActorOnApifyCloud] HTTP ${response.status}\n${text.slice(0, 2048)}\n`);
        throw new Error(`Apify run-sync returned ${response.status}`);
    }

    const items = JSON.parse(text) as Record<string, unknown>[];
    if (items.length === 0) {
        process.stderr.write(`\n[runActorOnApifyCloud] dataset empty. Body:\n${text.slice(0, 2048)}\n`);
    }
    return items;
}

export function getDatasetItems(): Record<string, unknown>[] {
    if (!existsSync(DATASET_DIR)) return [];
    const files = readdirSync(DATASET_DIR).filter(f => f.endsWith('.json')).sort();
    const items: Record<string, unknown>[] = [];
    for (const file of files) {
        const content = readFileSync(join(DATASET_DIR, file), 'utf-8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            items.push(...parsed);
        } else {
            items.push(parsed);
        }
    }
    return items;
}
