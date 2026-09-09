---
phase: 4
title: "Streaming and skeletons"
status: in-progress
priority: P1
effort: "3h"
dependencies: []
---

# Phase 4: Streaming and skeletons

## Overview

The repo contains **no `loading.tsx` anywhere** and three `<Suspense>` boundaries, two of which exist
only to satisfy `useSearchParams`. So every navigation shows a white screen for the whole data chain.

This phase delivers the requested skeleton UX **without moving any fetching to the client**: shell
and chrome paint immediately, data regions stream in as they resolve.

**No longer depends on Phase 3.** The original ordering assumed `proxy.ts` made two network round
trips before rendering; it makes one, and always did. The proxy still runs before any rendering, so
its single `getUser()` remains a floor on how early a skeleton can appear — but nothing in Phase 3
moves that floor, and this phase can start immediately.

## Requirements

**Functional**
- Every navigation paints a skeleton promptly instead of a white screen.
- Independent data regions stream independently; a slow analytics call never holds up the shell.
- Skeleton geometry approximates the real content, so layout does not jump on arrival.

**Non-functional**
- No fetching moves to the client. No new API routes. Tokens stay server-side.
- Skeleton components stay presentational and small, matching the repo's 200-line rule.

## Architecture

The pattern already exists at `app/(app)/p/[ref]/page.tsx:181`, where `ServiceUsage` sits behind
Suspense with an `animate-pulse` fallback and a comment explaining why. This phase generalises it.

**Two rules from `node_modules/next/dist/docs/.../file-conventions/loading.md` shape everything here.**
Both were read during implementation; neither matches the intuition the phase was written with.

1. > `loading.js` wraps `not-found.js`, `page.js`, and nested `layout.js` files in a `<Suspense>`
   > boundary. It does **not** wrap the `layout.js` … in the same segment.

   So `app/(app)/loading.tsx` is what shows while `p/[ref]/layout.tsx` resolves. It therefore **cannot
   be board-shaped** — it stands in for every page in the group *and* for project navigation. It is
   deliberately generic.

2. > If the layout accesses uncached or runtime data (e.g. `cookies()`, `headers()`, or uncached
   > fetches), `loading.js` will not show a fallback for it. **Without Cache Components: Navigation
   > blocks until the layout finishes rendering.**

   `app/(app)/layout.tsx` calls `requireUser()` and `getVaultMeta()`, both cookie-backed, and
   `cacheComponents` is off. **Every navigation blocks on that layout before any skeleton can
   appear.** After Phase 2 that is one cached `getUser()` plus one `vault` select — roughly 2 round
   trips, and that is the hard floor on time-to-skeleton.

**Not fixed here, on purpose.** The documented remedies are to move the fetching into `page.js` or
wrap the runtime access in its own `<Suspense>`, which for this layout means handing promises to
`Sidebar` and `VaultProvider` and having them `use()` them. That is a real restructuring of a client
boundary, and Phase 1 has not yet measured whether 2 round trips is even the problem. The skeletons
below already convert the much larger wait — the 5–8 round trip Management API fan-out — into visible
progress. Measure, then decide.

**Shared skeleton primitive** — `components/ui/skeleton.tsx` codifies the
`animate-pulse rounded-md border border-border bg-card/50` string already inlined at
`p/[ref]/page.tsx:181`, `connect-sheet.tsx:287`, `connect-framework-panel.tsx:239` and
`connect-orm-panel.tsx:95`. Border and card tint, not a flat grey block, so a loading screen keeps
the same surfaces as the content replacing it.

## Related Code Files

- Create: `components/ui/skeleton.tsx`, `app/(app)/loading.tsx`, `app/(app)/p/[ref]/loading.tsx`,
  `app/(app)/p/[ref]/tables/loading.tsx`
- Modify: nothing. See "What shipped".

## Implementation Steps

1. ✅ `components/ui/skeleton.tsx` — one presentational component, theme tokens, no logic.
2. ✅ The three `loading.tsx` files, each reusing the real page's container and spacing classes so
   nothing shifts on swap.
3. ⬜ `pnpm build && pnpm start`; navigate cold to each route and confirm a skeleton appears before
   content.
4. ⬜ Compare FCP against `baseline.md` (needs Phase 1).
5. ⬜ Decide the deferred items below against those numbers.

## What shipped

- `components/ui/skeleton.tsx` — codifies the placeholder already inlined in four places.
- `app/(app)/loading.tsx` — generic, per rule 1 above.
- `app/(app)/p/[ref]/loading.tsx` — mirrors the overview's two-column split; the dotted canvas renders
  for real since it is static and cheap.
- `app/(app)/p/[ref]/tables/loading.tsx` — sidebar / tab bar / toolbar / rows frame.

**Zero changes to existing files.** Four new files, all presentational. No fetching moved, no page
logic touched, so nothing here can regress a data path.

## Deferred, with reasons

- **Intra-page Suspense splits** (the overview's 8-way `Promise.all`, the tables grid). Both need
  their data-dependent regions extracted into async child components. On the overview that risks the
  per-tile failure reasons — `notes` is built from `disk.reason` and `metricsText.reason` — being
  replaced by a fallback that never resolves, which is worse than a slow tile. `loading.tsx` already
  covers the navigation case these would improve. Revisit against Phase 1's numbers.
- **Unblocking `app/(app)/layout.tsx`** — see Architecture. Needs measurement first.

## Success Criteria

- [x] Four new files; `pnpm typecheck`, `pnpm lint`, `pnpm build` clean; `pnpm test` 262/262.
- [x] Zero fetching moved to the client; no new `"use client"`; no existing file modified.
- [x] `app/(app)/loading.tsx` is generic, not board-shaped, per the nested-layout rule.
- [ ] Skeleton visible under 800 ms on a cold production load of `/p/[ref]/tables`. **Unmeasured.**
- [ ] Full content under 2 s on the same load. **Unmeasured.**
- [ ] No white screen on any navigation across `/`, `/p/[ref]`, `/p/[ref]/tables`, `/connections`,
      `/settings`. **Unverified — needs the app running.**
- [ ] No layout shift when skeleton swaps for content. **Unverified.**

## Risk Assessment

**Skeletons that mask a real regression.** A pretty loading state makes slowness feel acceptable and
removes the pressure to fix it. Mitigation: Phases 2, 3 and 5 do the real work; this phase is graded
on FCP against a recorded baseline, not on appearance.

**Suspense swallowing error states.** The overview renders per-tile failure reasons from `attempt()`.
A badly placed boundary could replace a meaningful "missing required scopes" message with a skeleton
that never resolves. Mitigation: explicit success criterion; test with a deliberately scope-limited
OAuth connection.

**Layout shift.** A skeleton whose geometry does not match the content produces a visible jump, which
reads as *worse* than the white screen it replaced. Mitigation: reuse the real container classes.

**Parent layout still blocking.** The most likely reason this phase under-delivers. Mitigation: it is
called out first in Architecture and step 6 revisits it with real numbers.
