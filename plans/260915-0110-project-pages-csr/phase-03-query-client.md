---
phase: 3
title: "Query client and hooks"
status: pending
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

## Success Criteria

- [ ] One client per browser session; none at module scope.
- [ ] `useProjectPart` rejects a part name that is not in the map, at compile time.
- [ ] A refusal reaches the caller as a reason, not as a thrown error.
- [ ] The provider's cost to every route's first load is measured and recorded.

## Risk Assessment

**A provider in the layout is on every route**, including the ones that fetch nothing from it. Measure
what it adds; if it is significant, scope it to the project routes instead.
