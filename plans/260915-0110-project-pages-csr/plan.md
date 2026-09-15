---
title: "Project pages: client fetching with TanStack Query"
status: in-progress
created: 2026-09-15
blockedBy: []
blocks: []
---

# Project pages: client fetching

The two read-only project dashboards stop awaiting their data on the server. The page becomes a shell
that paints at once; each card fetches its own part through TanStack Query and shows a skeleton until
it lands.

Design, the measurement behind it, and what this gives up:
[260915-0104-project-pages-csr-brainstorm.md](../reports/260915-0104-project-pages-csr-brainstorm.md).
**Read it before starting.**

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Measure the baseline](phase-01-baseline.md) | **done** | ~1h | — |
| 2 | [The read endpoint family](phase-02-read-endpoints.md) | **in-progress** | ~4h | — |
| 3 | [Query client and hooks](phase-03-query-client.md) | pending | ~2h | 2 |
| 4 | [Project overview page](phase-04-overview-page.md) | pending | ~1d | 3 |
| 5 | [Database page](phase-05-database-page.md) | pending | ~4h | 3 |
| 6 | [Measure again, and the states nobody looks at](phase-06-verify.md) | pending | ~2h | 4, 5 |
| 7 | [Table editor](phase-07-table-editor.md) | pending | ~1.5d | 3 |
| 8 | [SQL editor page](phase-08-sql-editor-page.md) | pending | ~2h | 3 |

## The decision, and what it costs

Stated twice and reaffirmed twice. Recorded here so nobody re-opens it from the code alone:

- **Client fetching cannot make the Management API faster.** It moves those calls after hydration.
  Skeletons appear sooner; numbers appear later. The trade was made for the client cache and for one
  consistent data-fetching story, not for time-to-data.
- **It adds a read API where the app had none.** Server actions were the only callable surface.
  `resolveProject` is the gate, exactly as it is for every action, and the part whitelist is the rest
  of the defence.
- The alternative — one Suspense boundary per card, no dependency, ~3h — is written up in the report
  and was not chosen.

## Settled decisions

- **One handler, not ten.** `app/api/projects/[ref]/[part]/route.ts` with a whitelist map. Ten files
  would be ten copies of the same authorisation, and nine chances to get one of them wrong.
- **No token, ever, in a response body.** Handlers return shaped data.
- **`lib/safe.ts`'s taxonomy survives the wire.** "Forbidden, and here is why" is what the disk and
  memory cards print today; collapsing it into an HTTP status would replace a reason with a shrug.
- **`/tables` and `/sql` are in scope too**, added 2026-09-15 after the first scope was set. They
  are phases 7 and 8 rather than extra work folded into 4 and 5, because the table editor is a
  different problem: its reads are a **chain**, not a fan-out.
- **A part may make several upstream calls when they are data-dependent; the browser never walks a
  chain.** The table editor sets this rule and phase 7 explains why — four server-side hops become
  four browser round trips if the chain moves to the client, which would make the most-used page in
  the app slower rather than faster.
- **Write paths do not move.** `write-actions.ts`, `ddl-actions.ts` and `runSql` stay server actions
  with their confirms and their audit trail. Their results invalidate queries by key, which is what
  replaces `router.refresh()`.
- **The paused/restoring branch stays on the server.** It has to be decided before any fan-out is
  attempted, and it is the one case where the fan-out would fail entirely.

## Order

Phases 1-6 are the two read-only dashboards, where the complaint started. Phase 7 is the table editor
and is the largest and riskiest piece; it waits on 3 but not on 4-6, so it can start once the hooks
exist — though doing 4 first means its pattern is proven on an easy page before the hard one. Phase 8
is small and last.

## Success metrics

- Shell and project title paint without waiting on the fan-out.
- Every card: skeleton, settled state, and an error state carrying the API's own reason.
- No access token and no raw Management API envelope in any response body.
- Unknown `part` → 404. Unowned `ref` → 404.
- A revisit inside the stale window issues no new requests.
- Before/after numbers by phase 1's method, not impressions.
