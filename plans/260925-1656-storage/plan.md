---
title: "Storage"
status: completed
created: 2026-09-25
blockedBy: []
blocks: []
---

# Storage

Buckets, files, storage config, policies and the S3 surface — as a project page of its own, not a
settings section. The `storage` slug already exists in `components/project-nav.tsx` and is greyed;
this fills it, and removes the Storage row from the settings nav, since its one screen becomes a tab
here.

Ground truth: [260925-storage-api-measured.md](../reports/260925-storage-api-measured.md), measured
this session against a live project with a throwaway bucket. Where it disagrees with
[260925-storage-research.md](../reports/260925-storage-research.md), it wins — and it disagrees about
the shape of object listing, which is the heart of phase 3.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [The page, and the Settings tab](phase-01-page-and-settings.md) | **done** | ~4h | — |
| 2 | [A project credential, and buckets](phase-02-buckets.md) | **done** | ~6h | 1 |
| 3 | [The file explorer](phase-03-file-explorer.md) | **done** | ~2d | 2 |
| 4 | [The Policies tab](phase-04-policies.md) | **done** | ~4h | 2 |
| 5 | [Analytics, Vectors and S3](phase-05-analytics-vectors-s3.md) | **done** | ~4h | 1 |

## The decision this feature turns on

**Storage needs a project credential, and the app has never used one.** Everything built so far runs
on the Management API with the user's personal access token. Measured:

```
GET https://{ref}.supabase.co/storage/v1/bucket
  service_role key           200
  Management API PAT         400  "Invalid Compact JWS"
```

The Management API has exactly three storage paths — list buckets, read config, write config — and
nothing else. Creating a bucket, listing a file, uploading anything: all of it is on the project's
own Storage API, which will not take the token this app holds.

It can get one. `GET /v1/projects/{ref}/api-keys?reveal=true` returns `service_role`, which the API
keys page already reads. That key **bypasses every RLS policy on `storage.objects`**, so from here
on the app holds, briefly, the most powerful credential a Supabase project has.

Agreed with the user: read it on demand, cache it in-process for 60 seconds, never store it, never
send it to the browser.

## Settled decisions

- **The browser uploads directly, and never sees the key.** `POST /object/upload/sign/{bucket}/{path}`
  returns a URL that accepts a `PUT` with no `authorization` header at all — measured. The server
  signs, the browser uploads. This also sidesteps the body limit a proxied upload would hit.
- **Two listing endpoints, used for different jobs.** `/object/list` walks one level at a time and
  returns a bare array where a folder is an entry with `id: null`; `/object/list-v2` returns an
  envelope and is flat. The browser uses v1. Deleting a bucket's contents uses v2, because one call
  finds every object however deep.
- **Emptying a bucket is asynchronous** — "may take up to an hour" — so the UI cannot empty and then
  delete. Deleting the objects and then the bucket works at once.
- **S3 access keys are not buildable.** No path in the Management API spec backs them, and they are
  not project API keys. The rest of that screen is.
- **`/config/storage` backs four screens at once**: the Settings tab, the S3 toggle, and whether
  Analytics and Vectors exist for this project at all.
