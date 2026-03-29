import { readFileSync, writeFileSync, rmSync, existsSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const PROJECT_ROOT = join(import.meta.dirname, '..');
const INPUT_PATH = join(PROJECT_ROOT, 'storage/key_value_stores/default/INPUT.json');
const DATASET_DIR = join(PROJECT_ROOT, 'storage/datasets/default');

export function setInput(input: Record<string, unknown>): void {
    writeFileSync(INPUT_PATH, JSON.stringify(input, null, 2));
}

export function clearDataset(): void {
    if (existsSync(DATASET_DIR)) {
        rmSync(DATASET_DIR, { recursive: true, force: true });
    }
}

export function runActor(): string {
    return execSync('apify run', {
        cwd: PROJECT_ROOT,
        timeout: 120_000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
    });
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
