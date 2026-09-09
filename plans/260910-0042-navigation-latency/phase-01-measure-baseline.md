---
phase: 1
title: "Measure and baseline"
status: pending
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Measure and baseline

## Overview

Establish real numbers before changing anything, and answer the one unknown that decides Phase 5.
Without this, later phases are graded on feel — the exact failure mode that produced the original
"switch to client components" theory.

## Requirements

**Functional**
- Record the SuperDB Supabase project's region.
- Record per-stage timings for one cold production navigation to `/p/[ref]/tables`.
- Record `getUser()` call count per navigation.

**Non-functional**
- Measurement code is temporary. It does not ship to `dev`.

## Architecture

Two independent facts, two methods.

**Region** — Supabase Dashboard → Project Settings → General → Region, for the project named by
`SUPABASE_URL`. This is SuperDB's *own* project (the one holding `connections`, `vault`,
`connection_events`), not any connected user project.

Why it matters: every `getUser()` and every `connections` select crosses to that region. From Vercel
`iad1`, a Singapore project is ~230 ms per round trip; a US East project is ~10–30 ms. Same code,
roughly a 1.5 s swing across five calls.

**Timings** — wrap each stage and read the numbers off the Vercel function log. `console.time` is
enough; do not add an instrumentation dependency for a one-off measurement.

Stages to bracket:

| Stage | Where |
|---|---|
| proxy `getUser()` | `proxy.ts` |
| proxy AAL check | `proxy.ts` |
| layout `requireUser()` + `getVaultMeta()` | `app/(app)/layout.tsx` |
| `resolveProject` (incl. `connectionsWithTokens`) | `lib/inventory.ts` |
| `listSchemas` | `app/(app)/p/[ref]/tables/page.tsx` |
| `listTablesIn` ‖ `getExposedSchemas` | same |
| rows ‖ count ‖ definition ‖ policies | same |

## Related Code Files

- Modify (temporarily, reverted at end of phase): `proxy.ts`, `app/(app)/layout.tsx`,
  `lib/inventory.ts`, `app/(app)/p/[ref]/tables/page.tsx`
- Create: `plans/260910-0042-navigation-latency/baseline.md` — the recorded numbers

## Implementation Steps

1. Look up the Supabase project region; write it into `baseline.md`.
2. Add `console.time`/`console.timeEnd` around each stage above. Label them distinctly
   (`lat:proxy-getuser`, `lat:resolve-project`, …) so they are greppable in the Vercel log.
3. Add a counter for `getUser()` — simplest honest version is a `console.log("lat:getuser")` inside
   `requireUser()` and both `proxy.ts` call sites, then count log lines for one request.
4. `pnpm build && pnpm start` locally, or deploy to a preview. **Production build only** — `next dev`
   compiles on demand and its numbers mean nothing here.
5. Navigate cold to `/`, then to `/p/[ref]`, then to `/p/[ref]/tables`. Capture the log for each.
6. Record in `baseline.md`: region, per-stage ms, `getUser()` count, and observed FCP from DevTools.
7. Revert every instrumentation edit. Confirm with `git diff` that the tree is clean.

## Success Criteria

- [ ] `baseline.md` names the Supabase project region.
- [ ] Per-stage timings recorded for all three navigations.
- [ ] `getUser()` count per navigation recorded — expected 4, confirm it.
- [ ] Baseline FCP recorded for `/p/[ref]/tables`.
- [ ] `git diff` clean; no instrumentation left in the tree.

## Risk Assessment

**Measuring the wrong build.** `next dev` numbers would send every later phase after the wrong
bottleneck. Mitigation: the phase requires `pnpm build && pnpm start`, stated twice.

**Instrumentation left behind.** `console.log` in `proxy.ts` runs on every request in production.
Mitigation: the final step is a `git diff` check, and it is a success criterion.

**Cold vs warm confusion.** A second navigation reuses connections and looks artificially fast.
Mitigation: record cold explicitly; note in `baseline.md` which numbers are cold.
