/**
 * Locale schema consistency tests.
 *
 * Validates that every locale's input_schema.json stays in sync with the
 * canonical zh-tw schema in .actor/. Catches drift where a locale gets a
 * new field added/renamed but the others don't.
 *
 * These are fast unit tests — no network, no apify run.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

interface InputSchema {
    properties: Record<string, { type: string; enum?: string[] }>;
    required?: string[];
}

const LOCALES = ['en', 'pt-br', 'ja', 'vi'] as const;

function loadSchema(dir: string): InputSchema {
    const raw = readFileSync(resolve(ROOT, dir, 'input_schema.json'), 'utf-8');
    return JSON.parse(raw) as InputSchema;
}

const canonical = loadSchema('.actor');
const canonicalFields = Object.keys(canonical.properties).sort();

describe('Locale input_schema consistency', () => {
    for (const locale of LOCALES) {
        describe(`${locale}`, () => {
            const schema = loadSchema(`.actor-${locale}`);

            it('has all canonical fields', () => {
                const localeFields = Object.keys(schema.properties).sort();
                expect(localeFields).toEqual(canonicalFields);
            });

            it('every field has the same type as canonical', () => {
                for (const field of canonicalFields) {
                    expect(schema.properties[field]?.type).toBe(
                        canonical.properties[field]?.type,
                    );
                }
            });

            it('enum fields have the same values as canonical', () => {
                for (const field of canonicalFields) {
                    const canonEnum = canonical.properties[field]?.enum;
                    if (!canonEnum) continue;
                    expect(schema.properties[field]?.enum).toEqual(canonEnum);
                }
            });
        });
    }
});
