---
phase: 4
title: "Project overview page"
status: pending
priority: P1
effort: "1d"
dependencies: [3]
---

# Phase 4: Project overview page

## Overview

`/p/[ref]` stops awaiting eight calls. The shell paints; each card fills itself in.

## Requirements

- The title, the URL and the layout paint without waiting on the fan-out.
- Every card: skeleton while pending, data when it lands, the API's own reason when refused.
- The paused and restoring states behave exactly as they do now.

## Architecture

**The page stays a server component**, and stays thin: `resolveProject` for the 404 and the title,
the paused/restoring branch, then the layout with client cards inside it. That branch has to stay on
the server — a paused project fails every one of the fan-out calls, and the card polls while it
restores.

**Each card becomes a client component** that calls `useProjectPart` for its own part. A card that
needs two parts asks for two queries and shows its skeleton until both land, rather than the page
waiting for either.

**Skeletons match the settled size.** A card that grows when its data arrives moves everything below
it; the placeholder carries the real height.

**`ServiceUsage` keeps its own shape** — it already streams behind Suspense and already has an
interval control. It moves to the `logs` part so the interval switch stops being a navigation.

## Related Code Files

- Modify: `app/(app)/p/[ref]/page.tsx`, and the card components it renders
- Create: client card components where the page currently inlines markup
- Read for context: the phase 1 numbers, `components/service-usage.tsx`

## Implementation Steps

1. Split the page's markup into cards, each owning one part.
2. The shell: identity, paused branch, layout, skeletons.
3. Wire each card to its query.
4. The refused case for disk and metrics, which is the one users actually hit.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Success Criteria

- [ ] Title and layout paint before any fan-out call returns.
- [ ] Each card shows a skeleton of the right size, then its data.
- [ ] A refused disk or metrics read prints its reason, as it does today.
- [ ] Paused and restoring projects behave exactly as before.
- [ ] Switching the usage interval does not re-navigate.

## Risk Assessment

**Ten requests where there was one.** The browser now issues a request per card. HTTP/2 makes that
cheap on the wire; the upstream Management API still sees the same ten calls, now with less ability
to share work between them.

**A skeleton that never settles.** Every query needs its error branch exercised, not just its happy
path.
