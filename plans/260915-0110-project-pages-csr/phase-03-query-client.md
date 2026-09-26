---
phase: 3
title: "Query client and hooks"
status: in-progress
priority: P1
effort: "2h"
dependencies: [2]
---

# Phase 3: Query client and hooks

## Overview

`@tanstack/react-query` wired once, and one hook every card uses.

## Requirements

- A single `QueryClient`, created per browser session, not per render.
- `useProjectPart(ref, part)` typed against the same part map as the handler.
- Sensible defaults: a stale window long enough that revisiting a project costs nothing.

## Architecture

**Version**: `@tanstack/react-query` 5.102.8, published 2026-08-27 — confirm at install, as with every
dependency here.

**The provider** goes in the app layout as a client component. The `QueryClient` is created inside
`useState`, never at module scope: a module-level client is shared between requests on the server and
between users in dev.

**Defaults**: `staleTime` 60s — the window in which a revisit costs nothing, which is the whole
reason this plan exists; `gcTime` 5m; `retry` 1; `refetchOnWindowFocus` false. Focus refetching on a
dashboard that fans out to ten upstream calls is a way to hammer the Management API by alt-tabbing.

**Keys**: `["project", ref, part]`, plus the interval for `logs`. One helper builds them, so an
invalidation cannot miss a key by spelling it differently.

**The hook** returns the taxonomy as it arrives: `pending`, `data`, or `refused with a reason`. A
refusal is not an error — it is an answer, and the card prints it.

## Related Code Files

- Create: `components/query-provider.tsx`, `components/use-project-part.ts`
- Modify: `app/(app)/layout.tsx`
- Read for context: `lib/project-parts.ts` from phase 2

## Implementation Steps

1. Install and confirm the version.
2. The provider, with the client in state.
3. The hook and the key helper.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`; check what the provider adds to the
   first load of every route, since it is in the layout.

## What was built, where it differs from the plan

- **The provider is scoped to the project routes, not the shared `(app)` layout.** In the shared
  layout it measured **+24,401 bytes** on every route under it, including `/`, `/connections` and
  `/settings`, none of which fetch through it. Moved to `app/(app)/p/[ref]/layout.tsx`, where every
  consumer already lives:

  | Route | First load | Change |
  |---|---|---|
  | `/p/[ref]` | 785,853 | +24,401 |
  | `/p/[ref]/database` | 627,430 | +24,401 |
  | `/p/[ref]/sql` | 774,683 | +24,401 |
  | `/p/[ref]/tables` | 876,162 | +24,401 |
  | `/`, `/connections`, `/settings` | unchanged | 0 |

- **The hook returns four states, not three.** `pending`, `ready`, **`refused`** and `failed`. The
  split that matters is the middle two: a missing OAuth scope is an *answer* — the disk and memory
  cards print that sentence today — while an expired session is a failure worth retrying. Collapsing
  them would either retry something that will never succeed or show a skeleton for a question that
  has already been answered.
- **The fetcher checks the body's shape before trusting it.** Every refusal from this API is JSON,
  the proxy's included; a body that is not means something else answered, and saying so beats a
  syntax error about a page nobody asked for.
- **`@tanstack/react-query` 5.102.8** installed and confirmed, 745KB unpacked.
- Per-part response types are not modelled yet: the readers are typed `Promise<unknown>`, so the
  hook takes the shape from its caller. The cards know what they render, and phase 4 will say whether
  that stays honest.

## Success Criteria

- [x] One client per browser session; none at module scope — created inside `useState`.
- [x] `useProjectPart` rejects a part name that is not in the list, at compile time: `Part` comes
      from the same module the route handler validates against.
- [x] A refusal reaches the caller as a reason, not as a thrown error.
- [x] The provider's cost is measured and recorded, and acted on: scoped to the four project routes
      rather than paid for on seven.
- [ ] **Reviewed with its first consumer.** The hook has no callers yet; phase 4 is where its
      contract is exercised, so that is where it gets read.

## Risk Assessment

**A provider in the layout is on every route**, including the ones that fetch nothing from it. Measure
what it adds; if it is significant, scope it to the project routes instead.
