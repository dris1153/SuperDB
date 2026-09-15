---
name: csr-fanout-amplifies-resolveproject
description: every /api/projects/[ref]/[part] request re-runs resolveProject — largely mitigated by the owners memo and the in-flight refresh map, but both are in-process only
metadata:
  type: project
---

Each part request independently calls `resolveProject` (`lib/project-parts.ts` → `readPart`), which
runs `connectionsWithTokens()` (DB read + unwrap per connection). React `cache()` is per-request, so
it does not dedupe across the browser's parallel queries.

**Mitigated as of 2026-09-15** — verified while reviewing the database page (5 parallel parts):

- `owners` in `lib/inventory.ts` is a per-user, 60 s Map that remembers which connection answered
  *and the project body*, so a warm entry costs zero `getProject`. The page shell resolves
  server-side before the HTML ships, so the browser's parts hit a warm entry on first load.
- `refreshes` in `lib/connections.ts` (`accessTokenFor`) single-flights the OAuth refresh by
  connection id, and the loser re-reads the row instead of writing `last_error`.

**What still stands — and the mitigation is weaker than recorded.** Verified 2026-09-15 against
`.next/server`: `lib/inventory.ts` and `lib/connections.ts` are each compiled **twice**, once in the
`app-route` layer and once in `app-rsc` (see [[module-state-splits-per-next-layer]]). So the `owners`
entry the RSC page shell warms is in a *different* Map from the one the browser's part requests read
— the claim above that the parts "hit a warm entry on first load" is unproven and probably false.
`refreshes` likewise does not single-flight between a route handler and an RSC render. On top of
that: on a multi-instance deploy each cold instance re-fans-out, and `connectionsWithTokens()` still
runs a DB read plus an unwrap per connection on *every* part request.

**Why:** the CSR conversion (plans/260915-0110-project-pages-csr) turns one server fan-out into N
browser requests; the phase risk notes count upstream part calls, not the authorisation behind them.

**How to apply:** do not re-raise the getProject fan-out or the refresh race as new findings — check
that the two memos above are still in place, then count requests × `connectionsWithTokens`.
Related: [[project-ref-not-unique]], [[mgmt-api-types-are-subsets]].
