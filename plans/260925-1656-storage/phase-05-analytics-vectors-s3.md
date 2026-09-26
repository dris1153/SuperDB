---
phase: 5
title: "Analytics, Vectors and S3"
status: completed
priority: P3
effort: "4h"
dependencies: [1]
---

# Phase 5: Analytics, Vectors and S3

## Overview

The three remaining sub-pages. Two are introductions to features this project cannot use; the third
is half-buildable and says which half.

## Requirements

- Analytics and Vectors: the original's introduction and its gate, driven by real flags.
- S3: the protocol toggle, the endpoint, the region.
- S3 access keys: state plainly that they cannot be managed here.

## Architecture

Everything comes from `/config/storage`, already read in phase 1:

```json
"icebergCatalog": {"enabled": false, "maxNamespaces": 10, "maxTables": 10, "maxCatalogs": 2},
"vectorBuckets":  {"enabled": false, "maxBuckets": 10, "maxIndexes": 5},
"s3Protocol":     {"enabled": true}
```

So the Pro-only gate is not inferred from a plan name — it is the project's own flag. When a flag is
true the page says the feature is available rather than offering an upgrade, which is more than the
original manages for a project that already has it.

**The S3 endpoint and region are derived, not fetched.** The endpoint is
`https://{ref}.storage.supabase.co/storage/v1/s3`; the region is the project's, which the app
already reads.

**Access keys cannot be built.** No path in the Management API spec backs listing or creating them,
and they are not project API keys. The section says so and links to the dashboard — the same shape
of honesty as the legacy JWT secret tab.

## Related Code Files

- Create: `app/(app)/p/[ref]/storage/analytics/page.tsx`, `vectors/page.tsx`, `s3/page.tsx`
- Create: `components/storage/s3-config.tsx`
- Modify: `lib/storage-actions.ts` — the S3 protocol toggle writes through `/config/storage`

## Implementation Steps

1. Analytics and Vectors: the introduction card and the gate, from `icebergCatalog.enabled` and
   `vectorBuckets.enabled`.
2. S3: the toggle, and copy-able endpoint and region.
3. The access keys section, stating what is missing and why.

## Success Criteria

- [x] Analytics and Vectors reflect the project's own flags rather than a guess about its plan.
- [x] Toggling S3 changes `features.s3Protocol.enabled` and survives a reload.
- [x] The endpoint matches what the dashboard shows for the same project — pinned in
      `lib/storage-config.test.ts` against a screenshot of that project.
- [x] No disabled "New access key" button pretending it is one permission away.
- [x] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` green — 491 tests.

## Risk Assessment

- **The toggle writes one feature, not the whole object.** `features` merges by key upstream, so
  sending `s3Protocol` alone leaves the rest untouched — and sending a feature that carries `max*`
  limits without them is refused. Phase 1 assumed the opposite and was corrected; this is the
  corrected rule.

## What was built differently

**One component for both bucket kinds.** Analytics and Vectors differ by three strings and a flag;
two files would have been the same file twice.

**A project that *has* the feature is told so.** The original shows an upgrade prompt either way,
because its gate is the plan. This gate is `icebergCatalog.enabled` / `vectorBuckets.enabled` from
the project's own config, so a project with them enabled reads "this project can use them" and is
pointed at the dashboard for creation — which is honest about the one thing that really is missing:
the Management API has no endpoint for creating either kind.

**The S3 toggle sends only `s3Protocol`.** It carries nothing but `enabled`, which is what makes it
safe to send alone — `features` merges by key upstream. `icebergCatalog` and `vectorBuckets` also
carry `max*` limits and are refused without them, which is why nothing here toggles those; they are
read-only on this page for a reason the API enforces rather than a choice.

**The endpoint is derived and tested.** Nothing returns it, so it is a string this app composes, and
a test pins it against the value the Supabase dashboard shows for the same project.

**The access keys section is a paragraph, not a disabled button.** Same decision as the legacy JWT
secret tab: a control that can never work implies the value is one permission away, which is worse
than saying plainly that the API has no path for it.

## What the final review caught

**`saveStorageConfig` grew a third setting without growing its guard.** `sizeProblem` reads the unit
only to build a message and never checks it is one this app has, so a crafted call passed validation
and `toBytes(50, "TB")` returned `NaN` — which serialises to `"fileSizeLimit": null` and went on the
wire. What that does to a project's global upload limit is unmeasured, which is its own reason not
to send one. The unit is checked now, `settings` is shape-checked rather than trusted, and both
booleans are narrowed instead of merely being `!== undefined`.

**Three copies of the disproven claim survived.** The whole feature was rebuilt around the
measurement that `PATCH /config/storage` **merges** `features` by key; the doc comment on
`updateStorageConfig` still said the opposite and prescribed read-merge-write, which is now the one
thing guaranteed to 400. Two plan risk lines said it too. All three corrected.

**The write body type let a caller compose a payload the API always refuses.** It reused the read
type, so `{features: {icebergCatalog: {enabled: true}}}` typechecked — and is refused, because that
feature also carries `max*` limits. The body type now names only the two features that can be
written, which is what phase 5's read-only decision actually rests on.

**`bucket-kind` took two props for one fact** — a flag name and a predicate reading it, with nothing
tying them together, so gating Analytics on the Vectors flag typechecked while printing the word
`icebergCatalog`. One prop now.

**A config that arrives empty no longer renders a confident "not available".** The route handler
ships `data ?? null` for an upstream success with no body, and these pages turned that into a
specific claim about a config they never received.

**The nav's greyed-row machinery was dead** once every row went live, and its doc described
behaviour that can no longer happen. Removed; `title` keeps naming which API is behind each screen,
which is the part that outlived the greying.

Smaller: an unused import the toolchain cannot see — this repo omits `eslint-config-next/typescript`
and sets no `noUnusedLocals`, so green lint and typecheck prove nothing about that class; a claim
that the S3 endpoint stops answering when the protocol is off, which was never measured; and
"Pro-only on every project measured", where one project was measured and the report files it under
unmeasured.
