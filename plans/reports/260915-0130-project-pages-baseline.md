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

---

# After: the same measurement, 2026-09-15

Phases 2–5, 7 and 8 shipped. Re-run with the same script, the same project and the same three runs.

## The upstream fan-out did not move, and was never going to

| Page | Fan-out before | Fan-out after |
|---|---|---|
| `/p/[ref]` | 1201–2198 ms | 799–1203 ms |
| `/p/[ref]/database` | 875–941 ms | 834–1259 ms |

**Those are the same calls taking the same time.** The overview's range looks better and the
database's looks worse; both are inside the variance phase 1 warned about after seeing 1201 ms and
2198 ms from one machine on one afternoon. Nothing in this plan touched a Management API call, so a
reading of this table that says "the change made it faster" is reading noise. The slowest members are
still `metrics` (1203 ms) and the read-only SQL calls (925–1259 ms).

`resolveProject` cost 359 ms this time against 254 ms before — again one connection, again one round
trip, again variance.

## What actually changed: what the server waits for before it sends anything

| Page | Server awaits before | Server awaits after |
|---|---|---|
| `/p/[ref]` | `resolveProject` + 8 calls | `resolveProject` |
| `/p/[ref]/database` | `resolveProject` + 5 calls | `resolveProject` |
| `/p/[ref]/tables` | `resolveProject` + up to 7 | `resolveProject` |
| `/p/[ref]/sql` | `resolveProject` + saved queries | `resolveProject` |

All four page components now await exactly one thing. Measured against this run's numbers, the
overview's server wait goes from **1455–2452 ms to 359 ms**, and the database page's from
**1129–1195 ms to 359 ms**. That is the number the complaint was about: the layout, the title, the
nav and every card frame are behind that wait and nothing else.

## What got worse, stated plainly

- **Time-to-data is later than before, not earlier.** The same upstream second still has to pass, and
  it now starts *after* the HTML arrives, after hydration, and after one extra hop through this app's
  own `/api/projects/[ref]/[part]` route. Nobody sees data sooner. They see the page sooner.
- **One page load is now many HTTP requests.** The overview issues nine where it issued one document.
  Each one re-authenticates and re-authorises; phase 4's `owners` memo (60 s) and phase 3's
  single-flight refresh exist because the first version of this made nine token refreshes against a
  rotating single-use token and broke the connection outright.
- **First load is bigger on every route this touched**, measured in this build against phase 1's:
  `/p/[ref]` 785,853 → 828,267; `/p/[ref]/tables` 876,162 → 895,608; `/p/[ref]/database`
  630,122 → 656,559; `/p/[ref]/sql` 777,375 → 791,960 bytes. TanStack Query and the part hook are not
  free, and they ship on every one of these pages.

## Secrets in the bodies, measured rather than claimed

`scripts/probe-part-secrets.mjs` reads every upstream body a reader passes through and reports field
*paths* that hold something secret-shaped — a PAT, a `sb_secret_` key, a JWT, a connection string
with a real password in it. Run against the same project:

- **Every pass-through part is clean**: branches, migrations, backups, disk, pooler, health.
- **`api-keys` still returns a live JWT in `api_key` at `reveal=false`.** The flag is not a boundary
  and never was. The reader picks `id`, `name` and `prefix`, and `KeySummary` is branded
  `api_key?: never` so a pass-through does not compile. This is the leak phase 5's review caught, and
  it is now checked by something that runs rather than by a comment.
- The pooler's `connection_string` holds `[YOUR-PASSWORD]`, a placeholder — Supabase does not return
  the database password through this API. The probe ignores a bracketed password for that reason;
  a real one would be reported.

Error text was read too: `describe()` in `lib/safe.ts` parses the upstream JSON and forwards only
`body.message`, so the `path → status {envelope}` string that `lib/mgmt-api.ts` throws never reaches a
browser. The one reader that was not an upstream call — `saved-queries`, this app's own database —
was forwarding raw Postgres text and now answers with one stable sentence.

## Still needs the app

These four are not in this note because nothing here can produce them without a signed-in session in
a browser, and writing them down from reasoning would be exactly the kind of claim this plan keeps
catching:

- Browser-side first paint, FCP and time-until-each-card, before and after.
- Every card walked through pending, settled, refused and failed with the network throttled.
- A revisit inside the 60 s stale window issuing no new requests, seen in the network panel.
- The expired-session path: the proxy answers the API with 401 JSON rather than a redirect to
  `/login`, which is what made an expired session surface as a JSON parse error.
