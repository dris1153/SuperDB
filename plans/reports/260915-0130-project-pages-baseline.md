# Baseline: what the project pages wait for

Phase 1 of [260915-0110-project-pages-csr](../260915-0110-project-pages-csr/plan.md). Measured
2026-09-15 against a live project (`ddfvxjfbazumqvoweehn`), three runs, cold, with
`scripts/probe-page-timings.mjs`.

**This is the number nobody had.** Both this plan and `260910-0042-navigation-latency` were opened on
"the page feels slow" and neither had measured it.

## Method

The pages await a fan-out: the calls do not depend on each other, so they run together and the page
renders when the **slowest** one lands. The script issues exactly the calls each page issues, in one
`Promise.all`, and reports each duration plus the maximum.

`SUPERDB_TIMING=1` now also logs every upstream call from the running app, through `call()` in
`lib/mgmt-api.ts` — one place, because that is where every Management API request already goes.

## `/p/[ref]` — the project overview

| Call | ms |
|---|---|
| overview (read-only SQL) | 1201 |
| metrics | 1173 |
| migrations | 923 |
| disk | 592 |
| branches | 309 |
| pooler | 289 |
| backups | 279 |
| addons | 157 |

**The page waits 1201–2198 ms** for this fan-out across three runs, plus **254 ms** for
`resolveProject` before it starts. Nothing renders in that time: the title, the URL and the layout
are all behind the same `await`.

## `/p/[ref]/database`

| Call | ms |
|---|---|
| health | 916 |
| tables (read-only SQL) | 915 |
| overview (read-only SQL) | 719 |
| disk | 199 |
| api keys | 186 |

**The page waits 875–941 ms**, plus the same 254 ms.

## What this says

- **The wait is real and it is upstream.** 1.5–2.5 s on the overview page before a single pixel of
  content, and none of it is server-rendering cost — it is eight HTTP calls to Supabase.
- **The slowest two are the read-only SQL call and metrics**, both around 1.2 s. Migrations at 923 ms
  is a surprise for a list that is usually short.
- **The variance is large**: the same fan-out took 1201 ms and 2198 ms across three runs. Any
  before/after comparison needs several runs, not one.
- **`resolveProject` costs about one round trip, not one per connection.** It asks every connection
  in parallel (`Promise.all` in `lib/inventory.ts`), so its cost is the slowest connection's answer,
  not their sum. 254 ms here with one connection.

## What this means for the plan

Client fetching moves these calls after hydration. It cannot make them shorter — **the 1.2–2.2 s
stays**, and lands later than it does today. What changes is that the shell paints first instead of
after, which is what the complaint was about.

The measurement also names two things worth doing whatever happens, both of which are phases in the
older latency plan and neither of which needs this one:

- **Region alignment** (`260910-0042-navigation-latency` phase 5). These numbers are from a machine in
  Vietnam to `api.supabase.com`. Where the app runs decides a large part of them.
- **Caching the slowest calls** (phase 6 there). Migrations and addons change rarely; metrics and the
  overview query do not need to be fetched fresh on every navigation.

## Caveats

- Measured from a development machine, not from where the app is deployed. The absolute numbers move
  with the deployment region; the *ratios* between calls are what to compare against later.
- Browser-side paint numbers — TTFB, FCP, time-until-each-card — still need the app running with a
  signed-in session. They are not in this note.
- One project, one connection. A user with several connections pays `resolveProject` once, in
  parallel, but a project that fails on the first connection tried will be slower.

## Phase 6 must re-run this

Same script, same project, same number of runs, and record **both** first paint and time-to-data.
First paint will improve. Time-to-data will not. Reporting only the first would be reporting the half
that flatters the change.
