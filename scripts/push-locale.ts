#!/usr/bin/env tsx
/**
 * Deploy the actor under a locale-specific listing.
 *
 * Usage: tsx scripts/push-locale.ts <locale>
 *   locale = zh-tw | en | pt-br | ja
 *
 * Default locale is zh-tw — it lives directly in .actor/ and README.md
 * because that's the listing with existing traffic. Other locales live in
 * .actor-{locale}/ with their own README.md inside that directory.
 *
 * Workflow for non-default locales:
 *   1. Require a clean git tree so we can't lose uncommitted work on restore.
 *   2. Copy .actor-{locale}/* over .actor/
 *   3. Copy .actor-{locale}/README.md over ./README.md
 *   4. Run `apify push --force` (non-interactive, auto-creates missing slots)
 *   5. Always restore .actor/ and README.md via `git checkout` — safe now
 *      that we verified the tree was clean before we touched anything.
 *   6. Also delete any stray files the copy may have left behind (e.g.
 *      .actor/README.md that isn't part of the default locale layout).
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const SUPPORTED_LOCALES = ['zh-tw', 'en', 'pt-br', 'ja'] as const;
const DEFAULT_LOCALE = 'zh-tw';
const SWAPPED_PATHS = ['.actor', 'README.md'];
const STRAY_CLEANUP_PATHS = ['.actor/README.md'];

type Locale = (typeof SUPPORTED_LOCALES)[number];

function isLocale(value: string): value is Locale {
    return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function run(cmd: string, args: string[]): void {
    console.log(`$ ${cmd} ${args.join(' ')}`);
    execFileSync(cmd, args, { stdio: 'inherit' });
}

function runCapture(cmd: string, args: string[]): string {
    return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
}

/**
 * Abort if any of the files we're about to swap have uncommitted changes.
 * Without this check, a failed push followed by `git checkout` in the
 * finally block would silently wipe hours of work.
 */
function assertSwapPathsClean(repoRoot: string): void {
    const status = runCapture('git', [
        '-C',
        repoRoot,
        'status',
        '--porcelain',
        '--',
        ...SWAPPED_PATHS,
    ]);
    if (status.length > 0) {
        console.error('❌ Refusing to push: swap paths have uncommitted changes.');
        console.error(status);
        console.error('\nCommit (or stash) your work first:');
        console.error('  git add .actor README.md && git commit -m "..."');
        process.exit(1);
    }
}

function restoreSwappedPaths(repoRoot: string): void {
    console.log('Restoring swapped paths from git');
    run('git', ['-C', repoRoot, 'checkout', '--', ...SWAPPED_PATHS]);
    for (const stray of STRAY_CLEANUP_PATHS) {
        const strayPath = resolve(repoRoot, stray);
        if (existsSync(strayPath)) {
            console.log(`Removing stray file: ${stray}`);
            rmSync(strayPath, { force: true });
        }
    }
}

function main(): void {
    const locale = process.argv[2];
    if (!locale || !isLocale(locale)) {
        console.error(`Usage: tsx scripts/push-locale.ts <${SUPPORTED_LOCALES.join('|')}>`);
        process.exit(1);
    }

    const repoRoot = resolve(import.meta.dirname ?? '.', '..');
    const actorDir = resolve(repoRoot, '.actor');
    const rootReadme = resolve(repoRoot, 'README.md');
    const localeDir = resolve(repoRoot, `.actor-${locale}`);
    const localeReadme = resolve(localeDir, 'README.md');

    const needsSwap = locale !== DEFAULT_LOCALE;

    if (needsSwap) {
        assertSwapPathsClean(repoRoot);

        if (!existsSync(localeDir)) {
            console.error(`Missing locale directory: ${localeDir}`);
            console.error(`Create it with the per-locale actor.json, input_schema.json, and README.md.`);
            process.exit(1);
        }
        if (!existsSync(localeReadme)) {
            console.error(`Missing README.md inside ${localeDir}`);
            process.exit(1);
        }
        console.log(`Copying ${localeDir} → ${actorDir}`);
        cpSync(localeDir, actorDir, { recursive: true, force: true });
        console.log(`Copying ${localeReadme} → ${rootReadme}`);
        cpSync(localeReadme, rootReadme, { force: true });
    }

    try {
        // --force bypasses interactive prompts (e.g. "actor doesn't exist,
        // create it?") so first-time pushes for new locales work headless.
        run('npx', ['-y', 'apify-cli', 'push', '--force']);
    } finally {
        if (needsSwap) {
            try {
                restoreSwappedPaths(repoRoot);
            } catch (err) {
                console.error('⚠️  Restore failed — working tree may be dirty:', err);
            }
        }
    }

    console.log(`✅ Deployed locale: ${locale}`);
}

main();
