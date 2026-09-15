---
phase: 4
title: "Project overview page"
status: in-progress
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

## What was built

The page is a shell: it resolves the project — which it must do anyway to know the page exists —
renders the title and the layout, and hands the rest to four client panels. `service-usage.tsx` is
deleted; the usage panel replaces it.

| Panel | Parts |
|---|---|
| `tiles` | addons, branches, migrations, backups — four queries, so migrations at 923 ms does not hold addons at 157 ms |
| `database-card` | addons, disk, metrics, overview |
| `connect-panel` | pooler |
| `usage-panel` | logs |

`addons` is asked for by two panels under the same key, so it is one request. Status, region and the
project name are the server's — it resolved them for the 404 — and are passed as two fields rather
than as the project, because `resolveProject` returns the upstream body verbatim.

`IntervalPicker` updates the URL through the history API instead of navigating, so switching the
range changes a query key rather than re-rendering the page on the server.

`/p/[ref]` first load: 785,853 → 827,574 bytes. That is the cost of moving this markup to the client.

## Review findings, and what came of them

Reviewed 2026-09-15 against the previous version of the page, line by line. Every figure, fallback,
the paused branch and both pooler derivations came through unchanged. Fixed:

- **The whole project envelope was crossing to the client.** `resolveProject` returns what the
  Management API returned, and handing that to two client components put every unmodelled field of
  `GET /v1/projects/{ref}` into the RSC payload — on the ordinary path, to read two strings. The same
  thing `lib/project-parts.ts` refuses to do on the way out. The page passes `region` and `dbHost`.
- **The refresh race became nine-way.** One page render used to trigger at most one token refresh;
  nine parts are nine requests inside the same second, and a single-use refresh token has one winner.
  The re-read added in phase 2 is a recovery, not a prevention — a loser that re-reads before the
  winner's update commits still writes `last_error`. Refreshes now share one in-flight promise per
  connection id in the process, so there is one upstream call and one audit event.
- **The gate cost an upstream call per part.** `readPart` resolves the project, and `cache()` only
  deduplicates within a request — so nine parts meant nine `getProject` calls before any of them read
  anything, roughly doubling what the page asks of an API that throttles. The memo now remembers the
  project body with the connection id for a minute. Never the token: that still comes from the
  caller's own RLS-scoped query, so a remembered entry cannot outlive access.
- **"Get connected" claimed a project fact while the request was in flight.** `ConnectInfo` could
  only say `string | null`, so a pending pooler read printed "This connection type is unavailable for
  this project." It now carries pending and the refusal reason, and the sheet shows the reason it was
  given rather than a claim about the project.
- **A reason nobody could reach.** The tiles put the refusal in a `title` attribute — hover only, so
  unreachable by keyboard and invisible on a touch screen. It is a tooltip now.
- **The usage header printed a real zero for a query that had not answered**, directly above the card
  explaining why it had not. It shows an em dash.
- **No error boundary.** The panels render bodies typed by hand against an API this app does not
  control; a shape change throws in render and would take the whole route down, including the shell
  this work exists to paint. `app/(app)/p/[ref]/error.tsx` limits it to the page.
- `pushState` became `replaceState`: Back used to leave the page, and one entry per interval change
  would have made it step through the ranges instead. Placeholder heights match the lines they stand
  in for.

**Deliberate display changes, recorded so they are not read as regressions later.** The old page used
`safe()` for addons, branches, migrations and backups, so a failed call was indistinguishable from an
empty list: it printed `NANO`, "No branches", "No migrations", "No backups" whether or not anything
had been read. Those now say "Unavailable" with the reason behind them. The compute suffix on the
region line is omitted rather than guessed.

## Success Criteria

- [x] Title and layout paint before any fan-out call returns — the shell awaits only `resolveProject`.
- [x] Each panel shows a placeholder the size of what replaces it, then its data.
- [x] A refused read prints its reason: in the card's notes, in a tooltip on the tiles, and inside
      the connect sheet.
- [x] Paused and restoring projects behave exactly as before — the branch is unchanged and still
      ahead of everything else.
- [x] Switching the usage interval does not re-navigate.
- [ ] **Needs the app.** All of the above, seen. Throttle the network first, or every placeholder is
      invisible.

## Risk Assessment

**Ten requests where there was one.** The browser now issues a request per card. HTTP/2 makes that
cheap on the wire; the upstream Management API still sees the same ten calls, now with less ability
to share work between them.

**A skeleton that never settles.** Every query needs its error branch exercised, not just its happy
path.
