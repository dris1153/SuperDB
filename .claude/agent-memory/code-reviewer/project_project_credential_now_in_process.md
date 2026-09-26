---
name: project-credential-now-in-process
description: Since Storage phase 2 the app holds project service_role keys in a globalThis memo — the threat model changed from "account token only" to "RLS-bypassing project key in heap"
metadata:
  type: project
---

`lib/project-key.ts` reads `service_role` (or a `secret` key) via `listApiKeys(..., reveal=true)` and
memoises it in `globalThis.__superdbProjectKeys`, keyed `connectionId:ref`. Reads of the Buckets tab
trigger it, and reads are **not** audited — only `recordWrite` paths are.

**Why:** the project's own Storage API refuses the Management API token (`Invalid Compact JWS`), so
there is no way to build Storage without a project credential. Measured, see
`plans/reports/260925-storage-api-measured.md`.

**How to apply:** every future review of a server-side module must now ask "could this reach the
project key", not just "could this reach the account token". Three specific traps found at review
time and worth re-checking: the `MAX_ENTRIES` bound is a global `store.clear()` (not per-user, unlike
[[part-cache]]'s deliberate per-user bound); an expired entry is not deleted when the refetch fails,
so key material outlives its stated 60s; and `forgetProjectKeys` is by connection id, which cannot
express the event that actually invalidates a key — a rotation or deletion on the *project*, which
this app's own API-keys page can do. Related: [[mgmt-api-types-are-subsets]],
[[module-state-splits-per-next-layer]].
