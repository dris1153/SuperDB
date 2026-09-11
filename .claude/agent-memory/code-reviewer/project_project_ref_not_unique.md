---
name: project-ref-not-unique
description: A Supabase project ref can appear more than once in loadInventory's output — any feature keyed on ref must tolerate duplicates
metadata:
  type: project
---

`InventoryProject.ref` is **not** unique across `loadInventory()`. Four facts combine:

- `lib/connections.ts::orgFor` records `listOrgs(token)[0]` only, but `listProjects` calls
  `GET /v1/projects`, which returns every project the token reaches — so one PAT connection can
  surface projects from orgs it is not keyed to.
- `sb_account_id` is never written (the comment at `orgFor` explains why: `/v1/profile` rejects the
  tokens this app can hold), so the unique index `connections_identity` on
  `(user_id, kind, coalesce(sb_account_id, org_slug))` reduces to `(user_id, kind, org_slug)`.
- `kind` is part of that index, so the *same* organization may be connected once as `pat` and once
  as `oauth`.
- `loadInventory` flatMaps per-connection results with no dedupe.

**Why:** it is a supported flow (connect an org by OAuth, then paste a PAT for the same account), so
it is not a corner case — and nothing in the code states the assumption it breaks.

**How to apply:** on any feature keyed on a project ref, check the duplicate path explicitly. React
`key={p.ref}`, `findIndex(r => r.id === ref)`, `Map` keyed on ref, and especially SQL
`insert ... on conflict do update` (Postgres raises 21000 "ON CONFLICT DO UPDATE command cannot
affect row a second time" when the *source* rows collide) all misbehave. See
[[project-schema-deploy-sequencing]] for the other standing trap in this area.
