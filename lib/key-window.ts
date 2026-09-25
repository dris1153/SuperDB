/**
 * How long a project key may be reused, and the check that enforces it.
 *
 * Its own module because `lib/project-key.ts` is `server-only` and reaches the Management API, so
 * the suite cannot import it — and this number is the one thing there worth pinning: it is how long
 * a credential that bypasses every row level security policy on a project stays in this process.
 */
export const PROJECT_KEY_TTL_MS = 60_000;

export const isFresh = (at: number, now = Date.now()) => now - at < PROJECT_KEY_TTL_MS;
