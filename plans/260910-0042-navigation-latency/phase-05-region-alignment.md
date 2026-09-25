---
phase: 5
title: "Region alignment"
status: blocked  # needs a syd1 preview to compare against; see baseline.md
priority: P2
effort: "30m"
dependencies: [1]
---

# Phase 5: Region alignment

## Overview

No `vercel.json` exists, so functions run in Vercel's default region `iad1` (US East). Every
`getUser()` and every `connections` select crosses from there to the SuperDB Supabase project's
region. With five-plus such round trips per navigation, a mismatched region can be the single largest
term in the total.

**Conditional phase.** Phase 1 decides whether it applies at all.

## Requirements

**Functional**
- Server functions execute in the region closest to the SuperDB Supabase project.
- No behaviour change beyond latency.

**Non-functional**
- Config only. No application code changes.

## Architecture

> **Corrected 2026-09-10.** The decision table below assumed every round trip goes to the Supabase
> project's region. It does not. **There are two backends, in different places**, and the original
> rule picked a winner without noticing it was a trade.

The project region is **`ap-southeast-2`** (AWS Sydney; Vercel's match is `syd1`). Traffic splits:

| Destination | Where | Round trips per `/p/[ref]/tables` |
|---|---|---|
| SuperDB's own Supabase project — auth, `connections`, `vault` | Sydney | ~4 |
| `api.supabase.com` — the Management API | Cloudflare anycast (`104.18.42.230`, `172.64.145.26`, `2606:4700::`); control-plane origin elsewhere | ~5 |

So moving `iad1` → `syd1` buys roughly 800 ms on the Sydney group and may give most of it back on the
Management API group, depending on where that origin sits and how Cloudflare's backbone routes to it.
**It could be a wash, or a regression.** Reasoning cannot settle it; only a preview deploy can.

One thumb on the scale for `syd1`: the user is in Vietnam, so the browser hop drops from ~250 ms
(`iad1`) to ~110 ms. That is one round trip, not N.

The corrected rule: **with N serial round trips split across backends in different regions, there is
no single "next to the data" — measure both placements.** The original one-backend rule only applies
when all N share a destination.

**Settled 2026-09-26 against `node_modules/next/dist/docs/`.** Only one mechanism is left:

1. `vercel.json` with a top-level `"regions"` array — applies to all functions. **This is the one.**
2. ~~`export const preferredRegion`~~ — **deprecated in this version of Next**, and on Vercel it now
   accepts only `'auto'`, `'global'` and `'home'`. A region code like `'syd1'` *throws*. The plan
   offered it as the finer-grained option; it no longer exists as one.

So the change, when it is made, is one file:

```json
{ "regions": ["syd1"] }
```

**Cost to be honest about:** users far from the chosen region pay a longer browser-to-server hop.
That is one round trip against the five-plus saved on the backend side. If Phase 1 shows backend
round trips are already fast (a US East project), this trade does not exist and the phase is skipped.

## Related Code Files

- Create (conditionally): `vercel.json`
- Read for context: `plans/260910-0042-navigation-latency/baseline.md`

## Implementation Steps

Region is known (`ap-southeast-2`), so this is now an A/B measurement, not a lookup.

1. Complete Phase 1 on the current `iad1` deployment, with the per-stage timings split into the two
   destination groups above. That split is the whole point — a single total cannot decide this.
2. ~~Confirm the region config mechanism~~ — done, see above.
3. Add `vercel.json` → `{"regions": ["syd1"]}` and deploy to a **preview**, leaving production on
   `iad1`.
4. Re-run the same measurements against the preview.
5. Compare group by group, not just the total: Sydney calls should collapse, Management API calls may
   rise. Note the browser hop separately — it improves either way for a user in Asia-Pacific.
6. Keep whichever wins on total time to interactive. Record both sets of numbers in `baseline.md`,
   including the losing one, so nobody re-litigates this from intuition.
7. If it is a wash, **revert to no `vercel.json`** and spend the effort on Phase 6 instead — an
   unexplained config file is worse than none.

## Success Criteria

- [ ] Region decision recorded in `baseline.md`, with the reason, including "skipped" if that is the
      outcome.
- [ ] If applied: measured reduction in per-stage auth and DB timings versus baseline.
- [ ] If applied: `vercel.json` carries a comment or the plan link explaining why this region, so the
      next reader does not "tidy it up".
- [ ] Full navigation smoke test on the preview deployment.

## Risk Assessment

**Optimising the wrong hop.** Moving the server away from users to sit near a backend that was never
slow. Mitigation: the phase is gated on Phase 1's measured region and reverts if the delta is
negligible.

**Region drift.** Someone later moves the Supabase project, or adds a second backend in another
region, and this config silently becomes wrong. Mitigation: record the reasoning next to the config,
not only in the plan.

**Cold starts in a lower-traffic region.** A less-used region can show more cold starts. Minor for
this workload, but watch it in the preview measurement rather than assuming.

## Where this stands 2026-09-26

The region was never the missing piece: it is in this file, and the project owner confirmed it —
`ap-southeast-2`, Vercel's `syd1`.

**There is a deployment after all** — `https://database.drisdev.io`, which the checkout gives no sign
of. Measured in [`baseline.md`](baseline.md): `x-vercel-id: hkg1::iad1::…`, so functions do run in
`iad1` and the premise of this phase holds.

What is missing is the *second* deployment. This is an A/B, and the numbers now say why it cannot be
skipped: authenticated Management API reads answer 200–400 ms slower than the same host's
edge-answered 401, which is a round trip to an origin outside Asia. Moving to `syd1` wins the ~800 ms
database group and the browser hop, and risks giving it back across five Management API calls.

The honest next step is not this phase at all — it is **phase 6**, which removes Management API
calls rather than relocating them, and which is built. Measure the board with the memo warm first;
if the Management API group shrinks enough, this phase's trade changes shape.

When it is run: `{ "regions": ["syd1"] }` on a preview, production left on `iad1`, and two runs of
`baseline.md` compared group by group.
