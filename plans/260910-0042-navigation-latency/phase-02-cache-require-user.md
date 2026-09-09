---
phase: 2
title: "Cache requireUser"
status: in-progress
priority: P1
effort: "30m"
dependencies: []
---

# Phase 2: Cache requireUser

## Overview

`requireUser()` performs a network `getUser()` and has **19 call sites**, none deduplicated. Wrapping
it in React `cache()` collapses them to one request per render, removing 2 round trips per
navigation for roughly three lines of change.

Shipped ahead of the `proxy.ts` work deliberately: this change is near-zero risk and should not wait
behind a security-gate rewrite.

## Requirements

**Functional**
- `requireUser()` issues at most one `getUser()` per request, regardless of call count.
- Every existing caller keeps its current contract — `{ supabase, user }`, throwing
  `"Not authenticated"` when there is no user.

**Non-functional**
- No behaviour change across request boundaries. `cache()` is per-request by construction.

## Architecture

`lib/inventory.ts:71` already establishes the pattern in this codebase, with a header comment
explaining why. Follow it.

```ts
// Wrapped in cache() because 19 call sites each performed their own getUser() round trip: the app
// layout, getVaultMeta and connectionsWithTokens alone made three per navigation.
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not authenticated");
  return { supabase, user: data.user };
});
```

Note the returned `supabase` client is now shared across callers within a request. That is fine —
`createClient()` is already per-request (it closes over `await cookies()`), and every caller uses it
the same way, for RLS-scoped queries as the signed-in user.

The visible win is in `app/(app)/layout.tsx`, where
`Promise.all([requireUser(), getVaultMeta()])` currently makes two `getUser()` calls in parallel
because `getVaultMeta()` calls `requireUser()` itself. After this change the second is free.

## Related Code Files

- Modify: `lib/supabase/server.ts` — wrap `requireUser` in `cache()`, add the header comment
- Read for context: `lib/inventory.ts` (existing `cache()` precedent), `app/(app)/layout.tsx`,
  `lib/vault-actions.ts`, `lib/connections.ts`

## Implementation Steps

1. `import { cache } from "react"` in `lib/supabase/server.ts`.
2. Convert `requireUser` from `export async function` to `export const requireUser = cache(async () => …)`.
3. Add the one-line "why" comment above it, matching the repo's existing style.
4. `pnpm typecheck` — confirm no call site broke on the declaration change.
5. `pnpm test` — expect 253 passing, unchanged.
6. Verify the dedup: temporarily log inside `requireUser`, load `/p/[ref]`, confirm one line per
   request instead of three. Remove the log.

## Success Criteria

- [x] `requireUser` is wrapped in React `cache()`.
- [x] `pnpm typecheck` clean.
- [x] `pnpm test` green — 262/262 (253 prior, plus 9 from Phase 3; no test regressed).
- [x] `pnpm lint` and `pnpm build` clean.
- [ ] One `getUser()` per render confirmed by temporary logging, then log removed. **Not run** — the
      change is verified statically only.
- [ ] Sign-in, sign-out, and an authenticated page load all still work manually. **Not run.**

## Risk Assessment

**Cross-request leakage.** Would be severe — one user's session served to another. Cannot happen:
React `cache()` scope is a single request/render pass, not a module-level or global store. Call this
out explicitly in review so nobody has to rediscover it.

**Stale user within one request.** A render that mutates the user then re-reads it would see the
cached value. No current caller does this; auth mutations happen in server actions that redirect
afterwards, starting a fresh request.

**Shared `supabase` client.** All callers use it identically for RLS-scoped reads as the signed-in
user, so sharing changes nothing. Worth a second look if a caller ever needs a differently-configured
client — it should call `createClient()` directly in that case.
