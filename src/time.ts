const RELATIVE_PATTERN = /^(\d+)([smhdw])$/i;
const ABSOLUTE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{2})$/;

const UNIT_TO_MS: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
};

export function normalizeTimestamp(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return '';

    const relativeMatch = trimmed.match(RELATIVE_PATTERN);
    if (relativeMatch) {
        const value = parseInt(relativeMatch[1], 10);
        const unit = relativeMatch[2].toLowerCase();
        const ms = UNIT_TO_MS[unit];
        if (ms) {
            return new Date(Date.now() - value * ms).toISOString();
        }
    }

    const absoluteMatch = trimmed.match(ABSOLUTE_PATTERN);
    if (absoluteMatch) {
        const month = absoluteMatch[1];
        const day = absoluteMatch[2];
        const year = `20${absoluteMatch[3]}`;
        return new Date(`${year}-${month}-${day}T00:00:00.000Z`).toISOString();
    }

    return '';
}
