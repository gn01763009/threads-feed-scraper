#!/usr/bin/env tsx
/**
 * Deploy the actor under a locale-specific listing.
 *
 * Usage: tsx scripts/push-locale.ts <locale>
 *   locale = zh-tw | en | pt-br | ja
 *
 * Default locale is zh-tw — it lives directly in .actor/ and README.md
 * because that's the listing with existing traffic (slot:
 * threads-feed-scraper). Other locales live in .actor-{locale}/ with
 * their own README.md inside that directory.
 *
 * Workflow for non-default locales:
 *   1. Copy .actor-{locale}/* over .actor/
 *   2. Copy .actor-{locale}/README.md over ./README.md
 *   3. Run `apify push` (which publishes to the slot defined in actor.json)
 *   4. Restore .actor/ and README.md from git
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SUPPORTED_LOCALES = ['zh-tw', 'en', 'pt-br', 'ja'] as const;
const DEFAULT_LOCALE = 'zh-tw';

type Locale = (typeof SUPPORTED_LOCALES)[number];

function isLocale(value: string): value is Locale {
    return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

function run(cmd: string, args: string[]): void {
    console.log(`$ ${cmd} ${args.join(' ')}`);
    execFileSync(cmd, args, { stdio: 'inherit' });
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
        run('npx', ['-y', 'apify-cli', 'push']);
    } finally {
        if (needsSwap) {
            console.log('Restoring .actor/ and README.md from git');
            run('git', ['checkout', '--', '.actor', 'README.md']);
        }
    }

    console.log(`✅ Deployed locale: ${locale}`);
}

main();
