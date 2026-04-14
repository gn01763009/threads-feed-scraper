#!/usr/bin/env tsx
/**
 * Sync the current .actor/actor.json title + description to the already-deployed
 * Actor on Apify. `apify push` only updates the *build* — it does NOT update the
 * Actor-level title/description displayed on the Store listing. This script
 * patches those via the Apify API.
 *
 * Usage: tsx scripts/sync-actor-metadata.ts <actorId>
 *
 * Token source: ~/.apify/auth.json (written by `apify login`). Never passed via
 * command line — only read from disk and sent via Authorization header.
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

interface ActorJson {
    title?: string;
    description?: string;
}

interface ApifyAuth {
    token?: string;
}

/**
 * Sync the current .actor/actor.json title+description to a deployed Actor.
 * Reads token from ~/.apify/auth.json (written by `apify login`).
 *
 * Callers that run this as part of push-locale should invoke it while the
 * locale-specific .actor/ is still swapped in — it reads from ./.actor/actor.json.
 */
export async function syncActorMetadata(actorId: string): Promise<void> {
    const authPath = resolve(homedir(), '.apify', 'auth.json');
    const auth = JSON.parse(readFileSync(authPath, 'utf8')) as ApifyAuth;
    if (!auth.token) {
        throw new Error(`No token found in ${authPath}. Run \`apify login\` first.`);
    }

    const repoRoot = resolve(import.meta.dirname ?? '.', '..');
    const actorJsonPath = resolve(repoRoot, '.actor', 'actor.json');
    const actorJson = JSON.parse(readFileSync(actorJsonPath, 'utf8')) as ActorJson;

    if (!actorJson.title || !actorJson.description) {
        throw new Error(`Missing title or description in ${actorJsonPath}`);
    }

    console.log(`Syncing metadata to Actor ${actorId}`);
    console.log(`  title:       ${actorJson.title}`);
    console.log(`  description: ${actorJson.description.slice(0, 80)}...`);

    const res = await fetch(`https://api.apify.com/v2/acts/${actorId}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${auth.token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            title: actorJson.title,
            description: actorJson.description,
        }),
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
        console.error('Usage: tsx scripts/sync-actor-metadata.ts <actorId>');
        process.exit(1);
    }
    syncActorMetadata(actorId).catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
    });
}
