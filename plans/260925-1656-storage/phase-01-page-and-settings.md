---
phase: 1
title: "The page, and the Settings tab"
status: completed
priority: P2
effort: "4h"
dependencies: []
---

# Phase 1: The page, and the Settings tab

## Overview

Open the `storage` slug, give it the two-level nav the screenshots show, and build the one tab that
needs no project credential.

## Requirements

- `/p/{ref}/storage` reachable from the project rail; the slug stops being greyed.
- The Storage row leaves the settings nav.
- A sub-nav: MANAGE (Files, Analytics, Vectors) and CONFIGURATION (S3), matching the original.
- The Files page's three tabs exist; Settings is the one that works in this phase.
- Settings reads and writes `fileSizeLimit` and `features.imageTransformation`.

## Architecture

`GET /v1/projects/{ref}/config/storage` answers one object that four screens read from:

```json
{"fileSizeLimit": 52428800,
 "features": {"imageTransformation": {...}, "s3Protocol": {...},
              "icebergCatalog": {...}, "vectorBuckets": {...}},
 "capabilities": {"list_v2": true, ...}}
```

`PATCH` takes `{fileSizeLimit, features, external}`. Only the first two are ours to touch.

**The size input is a number and a unit**, as in the original. The API's field is bytes; the form
shows MB. That conversion is a pure function and gets a test — an off-by-1024 here silently changes
a project's upload limit.

**The plan notice.** The original shows "Free Plan has a fixed upload file size limit of 50 MB" with
an upgrade button. Nothing in `/config/storage` states the plan. The organization's plan is
readable elsewhere; if it is not readable for a given connection, the notice is omitted rather than
guessed.

## Related Code Files

- Create: `app/(app)/p/[ref]/storage/layout.tsx`, `page.tsx`
- Create: `components/storage/storage-nav.tsx`, `files-tabs.tsx`, `storage-settings.tsx`
- Create: `lib/storage-config.ts` (+ test) — byte/MB conversion, feature flags
- Create: `lib/storage-actions.ts` — `saveStorageConfig`
- Modify: `lib/mgmt-api.ts` — `getStorageConfig`, `updateStorageConfig`
- Modify: `lib/project-part-names.ts`, `lib/project-parts.ts`, `lib/part-cache.ts`
- Modify: `components/project-nav.tsx` — `ready: true` on `storage`
- Modify: `components/project-settings/settings-nav.tsx` — remove the Storage row

## Implementation Steps

1. `getStorageConfig` / `updateStorageConfig` in `mgmt-api.ts`.
2. `lib/storage-config.ts`: the `StorageConfig` type, `toMegabytes`/`toBytes`, and predicates for
   whether analytics and vector buckets are available. Pure, tested.
3. Register a `storage-config` part with a short TTL — it is written from this page, so 0.
4. The route and its layout: a sub-nav column beside the content, the same shape
   `settings/layout.tsx` uses. `SettingsHeader` is reusable for the title.
5. The Files page with its three tabs; Buckets and Policies render an empty state saying which phase
   they arrive in, rather than pretending.
6. The Settings tab: the transformation switch, the size field with its unit, a Save that reports
   what the API said.
7. Remove the settings-nav row. Anyone following an old link lands on the settings index.
8. `pnpm typecheck && pnpm test && pnpm lint && pnpm build`. A new route needs `next typegen` first.

## Success Criteria

- [x] The rail's Storage entry is live and lands on Files.
- [x] Settings shows this project's real limit and transformation flag, and saving changes them.
- [x] MB and bytes convert both ways, with tests.
- [x] Storage no longer appears in the settings nav.
- [x] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` green — 465 tests.

## Risk Assessment

- **Changing `fileSizeLimit` affects every upload on the project.** It is a config write like any
  other on the settings pages, and gets the same audit entry.
- **`features` is a nested object, and how `PATCH` treats it was assumed rather than measured.**
  This said "read, merge, write". Measuring it during review showed the opposite — see the retro
  below — and the code was rewritten around the measurement.

## What was built differently

**`SettingsHeader` became `PageHeader` and moved to `components/`.** Storage needed the same title
block, and importing it from `components/project-settings/` would have said Storage is a settings
section when the whole point of this phase is that it is not.

**The plan notice was dropped rather than guessed.** The original shows "Free Plan has a fixed
upload file size limit of 50 MB" with an upgrade button. `/config/storage` says nothing about the
plan, so there is no notice — if the API refuses a value it says why, and that message is what gets
shown.

**`fromBytes` is exact, not pretty.** 52428800 reads "50 MB", but 52428801 stays in bytes. A limit
that changed by being looked at would be a field that silently rewrites what uploads a project
accepts.

**The empty Buckets and Policies tabs say what is missing and why** — that they need a project
credential the Management API cannot supply — rather than "coming soon".

## An assumption this phase was built on turned out to be wrong

The plan, the report and the first version of the code all said `PATCH /config/storage` **replaces**
`features` wholesale, so a caller had to read-merge-write or risk clearing a flag it did not show.
That was never measured. Review asked about a neighbouring case, measuring it answered both, and the
answer was different:

```
PATCH {fileSizeLimit}                            200  features and external both survive
PATCH {features: {imageTransformation: {...}}}   200  every other feature survives
PATCH {features: {icebergCatalog: {enabled}}}    400  ...maxNamespaces: expected number, received undefined
```

Top level merges, `features` merges by key, and a feature **sub-object** is validated in full. So
omitting a feature cannot silently clear it; sending half of one is refused with a 400 naming the
field. The safe direction.

That deleted `withFeature` and its test outright, and it changed the action's shape: it now takes a
size and a boolean rather than a `features` object. The browser can no longer name a feature at all,
which closes the same hole review raised — a `"use server"` export is an endpoint, and it was
forwarding a client-supplied `features` straight into the PATCH.

**Carried over to phase 5:** toggling Analytics or Vectors means sending their `max*` limits too.

## What review caught

- **A fractional size was rounded to zero in silence.** `toBytes(0.0001, "KB")` is 0; the field
  showed one limit and the project would have been given another, and what `fileSizeLimit: 0` means
  to Supabase is unmeasured. `sizeProblem` now requires whole units and at least 1, on both sides.
- **A config with no `fileSizeLimit` rendered the string "undefined"** in the input, with Save
  disabled and no way out. `fromBytes` takes `number | undefined` and answers 0 bytes.
- The reader's JSDoc had been inserted in front of the wrong function, leaving the signing-keys
  reader undocumented and this one described as a credential.
- `Tab` moved to `components/tab.tsx` beside `PageHeader`, for the same reason: three sections use
  it now, and importing it from `project-settings/` said Storage is a settings section.
- Smaller: the empty-group guard `settings-nav.tsx` has, a stale comment in `project-nav.tsx`, and
  prose still naming the deleted `SettingsHeader`.

`vectorsAvailable` and `analyticsAvailable` have no caller yet — phase 5 is where they are used.
Kept rather than deleted and re-added, since they are three lines sharing one predicate.
