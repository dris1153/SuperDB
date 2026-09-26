---
name: storage-config-patch-merges-by-key
description: PATCH /config/storage merges at the top level and within `features`, but validates a feature sub-object in full — so only features carrying nothing but `enabled` can be written
metadata:
  type: project
---

`PATCH /v1/projects/{ref}/config/storage` merges. Three levels, three behaviours, all measured:

```
PATCH {fileSizeLimit}                            200  features and external both survive
PATCH {features: {imageTransformation: {...}}}   200  every other feature survives
PATCH {features: {icebergCatalog: {enabled}}}    400  ...maxNamespaces: expected number, received undefined
```

- **Top level merges** — a field not sent is left alone.
- **`features` merges by key** — a feature not sent is left alone.
- **A feature sub-object is validated in full.** `imageTransformation` and `s3Protocol` carry only
  `enabled`, so they can be sent alone. `icebergCatalog` and `vectorBuckets` also carry `max*`
  limits and are **refused** without them.

So a caller cannot silently clear a flag by omitting it: the failure mode is a 400 naming the
missing field, which is the safe direction. Code does not need read-merge-write — that is now the
one thing guaranteed to fail.

**Why:** an earlier version of this note said the opposite, and `plans/reports/` said so too, on an
assumption nobody had checked. Measuring it deleted `withFeature` from `lib/storage-config.ts` and
reshaped `saveStorageConfig` to take named booleans rather than a `features` object — which also
closed the hole where a `"use server"` export forwarded a client-supplied `features` into the PATCH.
Recorded in `plans/reports/260925-storage-api-measured.md`; trust that report over the OpenAPI spec,
and over this file if they ever disagree.

**How to apply:** on any phase that writes storage config, send only what changed, and send a
feature sub-object **whole**. `lib/mgmt-api.ts`'s body type names only the two writable features for
this reason. Do not reintroduce a client-side merge; `components/query-provider.tsx` sets
`staleTime: 60_000`, so a form left open would merge from a snapshot as old as the page.
