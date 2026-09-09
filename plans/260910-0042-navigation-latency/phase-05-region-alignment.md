---
phase: 5
title: "Region alignment"
status: pending
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

The guiding rule: **with N serial round trips to one backend, colocate compute with the data, not
with the user.** One extra browser hop costs one round trip; a mismatched backend region costs N.
This app has N ≈ 5–8 before first paint, so data proximity wins decisively.

Decision table, driven by Phase 1's recorded region:

| Supabase project region | Action |
|---|---|
| Singapore (`ap-southeast-1`) | `vercel.json` → `{"regions": ["sin1"]}` |
| Other Asia-Pacific | pick the matching Vercel region (`hkg1`, `icn1`, `syd1`, `bom1`) |
| US East (`us-east-1`) | **Skip this phase.** Already aligned; the win is elsewhere |
| Europe | matching EU region (`fra1`, `lhr1`, `arn1`) |

Two mechanisms exist; confirm which applies before editing. Check
`node_modules/next/dist/docs/` per `AGENTS.md` — this Next version's conventions may differ from
training data:

1. `vercel.json` with a top-level `"regions"` array — applies to all functions.
2. Next's per-segment `export const preferredRegion` — finer-grained, useful only if different routes
   want different regions. Not needed here; every route hits the same backend.

Prefer option 1: one file, one line, no per-route drift.

**Cost to be honest about:** users far from the chosen region pay a longer browser-to-server hop.
That is one round trip against the five-plus saved on the backend side. If Phase 1 shows backend
round trips are already fast (a US East project), this trade does not exist and the phase is skipped.

## Related Code Files

- Create (conditionally): `vercel.json`
- Read for context: `plans/260910-0042-navigation-latency/baseline.md`

## Implementation Steps

1. Read the region from `baseline.md`. If it is US East, mark this phase skipped and stop.
2. Confirm the region config mechanism against `node_modules/next/dist/docs/`.
3. Add `vercel.json` with the matching region.
4. Deploy to a preview.
5. Re-run Phase 1's timing measurements on the preview. Compare against `baseline.md`.
6. Record the delta in `baseline.md`. If the improvement is negligible, revert — an unexplained
   config file is worse than none.

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
