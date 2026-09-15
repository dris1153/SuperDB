# Project pages: server render → client fetching with TanStack Query

2026-09-15. Decision taken after the costs were stated twice and reaffirmed. This report records the
measurement, the argument on both sides, and the design that was chosen — including what it gives up.

## The complaint

The project pages "show nothing until everything has loaded".

## What is actually happening — read from the code, not assumed

`app/(app)/p/[ref]/page.tsx`:

```
resolveProject(ref)                       one GET /v1/projects/{ref} per connection, serial
      ↓   the page body awaits
Promise.all([ 8 Management API calls ])   parallel with each other; the page returns nothing
      ↓                                   until the slowest settles
render everything
```

`app/(app)/p/[ref]/database/page.tsx` is the same shape with 5 calls.

Only `ServiceUsage` is behind `<Suspense>` (page.tsx:180). `loading.tsx` exists for `(app)`,
`/p/[ref]` and `/p/[ref]/tables`.

So the sequence a user sees is: route skeleton → a wait → **the whole page at once**. The header,
which needs nothing but `resolveProject`, waits for backups, migrations, addons and pooler config.

**This is not a property of server rendering.** Streaming already works here — `ServiceUsage` proves
it, arriving after everything else. The page has one page-level `await` where it wants several
boundaries.

## The unfinished plan this repeats

`plans/260910-0042-navigation-latency/` opened this session with the same complaint. Phase 4
(streaming and skeletons) is half-landed — `loading.tsx` and one boundary — and **phase 1, measure
and baseline, was never run**. There are still no numbers, then or now.

## The two answers

**A — boundary pass.** Split each page into islands behind `<Suspense>`, each with its own skeleton,
and add `experimental.staleTimes.dynamic` for back/forward reuse. ~3h, no dependency, no new API
surface, data arrives on the same round trip.

**B — client fetching with TanStack Query.** Route handlers per read; the page becomes a shell that
paints immediately and fills in from the client.

| | A: boundaries | B: client fetching |
|---|---|---|
| Header paints after | 1 call (`resolveProject`) | HTML + JS + hydrate + fetch |
| Data arrives | same round trip, streamed | one extra round trip later |
| New API surface | none | one read endpoint family |
| Dependency | none | `@tanstack/react-query` |
| Cache on revisit | `staleTimes` (one config line) | full client cache, refetch on focus |
| Effort | ~3h | ~2–3 days |

**B cannot make the Management API faster.** Those calls cost what they cost; client fetching moves
them after hydration, so skeletons appear sooner and numbers appear later. What it genuinely buys is
the client cache: Next's client cache for dynamic segments defaults to `staleTimes.dynamic: 0` since
v15, so moving between two projects refetches everything today.

**Chosen: B**, for the cache and for a consistent client data-fetching story going forward. A's
boundary work is not wasted — it is how the server side of B stays honest for the shell.

## Design

### Scope

In: `/p/[ref]` and `/p/[ref]/database` — the two read-only dashboards where the complaint lives.

Originally out: `/p/[ref]/tables` and `/p/[ref]/sql`. **Scope extended the same day** to include
both — they are phases 7 and 8 of the plan rather than folded into the dashboard work, because the
table editor is a different problem.

The table editor's reads are a **chain**, not a fan-out: schemas → tables → columns → rows, each step
needing the previous answer. Moving a chain to the browser does not parallelise it, it lengthens each
link — four server-side hops become four browser round trips, and the most-used page in the app gets
slower. The rule that follows, and that the plan now carries: a part may make several upstream calls
when they are data-dependent; the browser never walks a chain.

The SQL editor page is the opposite — it awaits one list and is already a shell.

### One endpoint family, not ten

Ten handlers would mean ten copies of the same authorisation. One dynamic segment with a whitelist:

```
app/api/projects/[ref]/[part]/route.ts
```

- `requireUser()` → `resolveProject(ref)` → look `part` up in a map of readers → JSON.
- `resolveProject` is already the authorisation gate everywhere else in the app: it only returns a
  token for a connection the signed-in user owns. An unknown `ref` is a 404 before anything is sent.
- An unknown `part` is a 404, from the map. The map is the whitelist; there is no dynamic dispatch
  into `lib/mgmt-api.ts`.
- **No token ever reaches the browser.** The handlers return shaped data, never the connection's
  access token, and never the raw Management API envelope.
- `Cache-Control: no-store`. These responses are per-user and derived from a decrypted token.

Parts: `identity`, `addons`, `branches`, `migrations`, `backups`, `disk`, `overview`, `metrics`,
`pooler`, `health`, `logs`.

### The error taxonomy has to survive

`lib/safe.ts` distinguishes "failed" from "forbidden, and here is why" — the project page prints
those reasons (`Disk: …`, `Memory: …`) rather than hiding a scope problem as an empty card. The
handlers return that shape as JSON rather than collapsing it into an HTTP status, so the UI keeps
saying which permission is missing.

### Client

- One `QueryClient` provider in the app layout. `staleTime` 60s for project reads, `gcTime` 5m,
  `refetchOnWindowFocus` off for the heavier parts.
- Key convention `["project", ref, part]`.
- One hook, `useProjectPart(ref, part)`, over the same whitelist type, so a typo is a type error.
- Each card renders its own skeleton from `isPending`, its own error from the taxonomy above.

### What the server still does

The page stays a server component shell: it resolves the project for the 404 and the title, renders
the layout and the card skeletons, and hands the rest to the client. The paused/restoring branch
stays server-side — it must be decided before any of the fan-out is attempted.

## Risks

**A read API where there was none.** Today server actions are the only callable surface. Every part
added to the map is a new thing to get authorisation right on, and the map is the whole defence.

**Data arrives later than it does now.** Measured against a baseline that does not exist yet — which
is why phase 1 of the old plan runs first, before and after.

**Reads and writes part ways.** Every read moves to a query; every write stays a server action, with
its confirm and its audit trail. That is the consistent story the extension buys — but it means a
write's effect now reaches the screen through cache invalidation rather than `router.refresh()`, and
an invalidation that names the wrong key leaves the old rows on screen after a successful write.

**The table editor's chain.** Its reads depend on each other. If any link ends up fetched from the
browser using what another fetch returned, the most-used page in the app gets slower, not faster.
Phase 7 exists to keep that chain on the server.

**Loading states that never settle.** A query that errors must show the reason, not a skeleton
forever. Every card needs its error branch exercised, including the "forbidden, here is why" case.

## Success criteria

- The shell and the project title paint without waiting on the fan-out.
- Every card has a skeleton, an error state carrying the API's own reason, and a settled state.
- No token, and no raw Management API envelope, appears in any response body.
- An unknown `part` and an unowned `ref` are both 404s.
- Revisiting a project within the stale window makes no new requests.
- Before/after numbers from phase 1's method, not impressions.
