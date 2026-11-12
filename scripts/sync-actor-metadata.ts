#!/usr/bin/env tsx
/**
 * Sync the Store listing to the already-deployed Actor on Apify. `apify push` only
 * updates the *build* — it does NOT update the Actor-level title/description displayed
 * on the Store listing. This script patches those via the Apify API.
 *
 * Title + description come from an actor.json. The SEO title, SEO description and Store
 * categories have no home in actor.json, so they live in scripts/store-listings.json,
 * keyed by Actor ID; an Actor without an entry there only gets title + description.
 *
 * Usage: tsx scripts/sync-actor-metadata.ts <actorId> [actorDir]
 *   actorDir defaults to .actor — pass e.g. .actor-en to sync a locale's listing
 *   without pushing a build.
 *
 * Token source, in order: APIFY_TOKEN, then ~/.apify/auth.json, then the macOS
 * keyring. Never passed via command line — only sent via Authorization header.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

interface ActorJson {
    title?: string;
    description?: string;
}

export interface StoreListing {
    seoTitle: string;
    seoDescription: string;
    categories: string[];
}

export type MetadataPatch = Required<ActorJson> & Partial<StoreListing>;

/** The exact body sent to the Apify API — kept pure so the listing rules are unit-testable. */
export function buildMetadataPatch(actorJson: ActorJson, listing: StoreListing | undefined): MetadataPatch {
    if (!actorJson.title || !actorJson.description) {
        throw new Error('Missing title or description in actor.json');
    }
    const base = { title: actorJson.title, description: actorJson.description };
    if (!listing) return base;
    return {
        ...base,
        seoTitle: listing.seoTitle,
        seoDescription: listing.seoDescription,
        categories: [...listing.categories],
    };
}

interface ApifyAuth {
    token?: string;
}

/**
 * Find the API token wherever `apify login` happened to put it.
 *
 * On macOS the CLI stores the token in the OS keyring and leaves auth.json with every
 * profile field but no `token` — so reading auth.json alone throws "run apify login"
 * at someone who is, in fact, logged in. That failure lands *after* a successful
 * `apify push`, which makes it look like the deploy failed when only the listing sync did.
 */
function readToken(): string {
    const fromEnv = process.env.APIFY_TOKEN;
    if (fromEnv) return fromEnv;

    const authPath = resolve(homedir(), '.apify', 'auth.json');
    try {
        const auth = JSON.parse(readFileSync(authPath, 'utf8')) as ApifyAuth;
        if (auth.token) return auth.token;
    } catch {
        // Not logged in at all, or the file is unreadable — the keyring may still have it.
    }

    if (process.platform === 'darwin') {
        try {
            // -a "token": the default lookup returns the *proxy* password, which is a
            // different credential that happens to authenticate against /users/me only.
            const out = execFileSync(
                'security',
                ['find-generic-password', '-s', 'com.apify.cli', '-a', 'token', '-w'],
                { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
            ).trim();
            if (out) return out;
        } catch {
            // No keyring entry — fall through to the error below.
        }
    }

    throw new Error(
        `No Apify API token found (checked APIFY_TOKEN, ${authPath}, and the macOS keyring). Run \`apify login\` first.`,
    );
}

/**
 * Sync the current .actor/actor.json title+description to a deployed Actor.
 *
 * Callers that run this as part of push-locale should invoke it while the
 * locale-specific .actor/ is still swapped in — it reads from ./.actor/actor.json.
 */
export async function syncActorMetadata(actorId: string, actorDir = '.actor'): Promise<void> {
    const token = readToken();

    const repoRoot = resolve(import.meta.dirname ?? '.', '..');
    const actorJsonPath = resolve(repoRoot, actorDir, 'actor.json');
    const actorJson = JSON.parse(readFileSync(actorJsonPath, 'utf8')) as ActorJson;
    const listingsPath = resolve(repoRoot, 'scripts', 'store-listings.json');
    const listings = JSON.parse(readFileSync(listingsPath, 'utf8')) as Record<string, StoreListing>;
    const patch = buildMetadataPatch(actorJson, listings[actorId]);

    console.log(`Syncing metadata to Actor ${actorId} from ${actorJsonPath}`);
    console.log(`  title:       ${patch.title}`);
    console.log(`  description: ${patch.description.slice(0, 80)}...`);
    console.log(`  seo fields:  ${patch.seoTitle ? `${patch.seoTitle} | ${patch.categories?.join(', ')}` : '(none listed)'}`);

    const res = await fetch(`https://api.apify.com/v2/acts/${actorId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`API error ${res.status}: ${body}`);
    }

    console.log(`✅ Actor metadata updated (HTTP ${res.status})`);
}

// CLI entry point — only runs when script is invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
    const actorId = process.argv[2];
    if (!actorId) {
        console.error('Usage: tsx scripts/sync-actor-metadata.ts <actorId> [actorDir]');
        process.exit(1);
    }
    syncActorMetadata(actorId, process.argv[3]).catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
