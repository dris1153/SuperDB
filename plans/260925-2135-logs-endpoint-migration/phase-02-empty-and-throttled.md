---
phase: 2
title: "What the page shows when logs are empty or throttled"
status: completed
priority: P2
effort: "2h"
dependencies: [1]
---

# Phase 2: What the page shows when logs are empty or throttled

## Overview

Two states this page will hit often and currently has nothing to say about.

## Requirements

- An empty window reads as "nothing in this window", not as a failure.
- A throttled request says it is throttled, and does not retry into it.

## Architecture

**Empty is the normal case on a quiet project.** Measured: this project had nine `auth_audit_logs`
rows in a day against four thousand `pgbouncer_logs`. `toCards` already returns every service with
zero-filled buckets, so the cards render — but a page of empty cards with no sentence is
indistinguishable from a page that failed to load.

**Throttling is aggressive and the page is not ready for it.** Six requests exhausted it; twelve
seconds between attempts still answered `ThrottlerException: Too Many Requests`; seventy seconds
cleared it. Two consequences:

- `lib/safe.ts` now shows an API's own message for a 429, so the throttle text will surface — but
  it names no time, unlike the signing-key throttle. The page should say waiting fixes it.
- TanStack must not retry this query. A retry storm against an endpoint with this limit makes the
  situation worse and is invisible from the UI.

Check what `components/query-provider.tsx` sets for `retry`; if it retries by default, the `logs`
part needs an exception.

## Related Code Files

- Modify: `components/project-overview/usage-panel.tsx` or wherever the cards are rendered
- Modify: `components/use-project-part.ts` if the retry policy needs a per-part override

## Implementation Steps

1. An empty-window line under the cards, stating the window rather than implying an error.
2. Confirm the retry policy, and disable retries for `logs` if they are on.
3. A throttled read says so in words, with waiting named as the fix.

## Success Criteria

- [x] A window with no traffic reads as empty, not broken.
- [x] A throttled read is reported as throttled.
- [x] Nothing retries automatically into the limit.

## Risk Assessment

- **Being wrong about "empty" is safe; being wrong about "failed" is not.** If a read genuinely
  failed, the page must not call it empty — the two states come from different branches of
  `PartState` and must stay that way.
