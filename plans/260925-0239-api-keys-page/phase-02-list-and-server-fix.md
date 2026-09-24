---
phase: 2
title: "The list, and the Server tab bug"
status: pending
priority: P1
effort: "4h"
dependencies: []
---

# Phase 2: The list, and the Server tab bug

## Overview

`/p/[ref]/settings/api-keys` listing what a project has, in two tabs — and the fix for a bug the
measurements turned up on the way.

## The bug, which ships first

`lib/connect-actions.ts:25` calls `listApiKeys(found.token, projectRef, true)` — `reveal=true`, the
call measured returning **403 on a healthy project with a PAT**. So `getServerEnv` returns
`blocked: true` with the upstream message, and the Connect sheet's **Server tab fails for every
connection**, reading exactly like a missing OAuth scope.

It does not need `reveal=true`. The publishable key comes back complete at `reveal=false`; only the
secret is withheld. The fix is to drop the flag and say plainly why `SUPABASE_SECRET_KEY` is empty,
instead of failing the whole tab.

## The list

**One request, two tabs.** `GET /api-keys` returns all four keys with `type` of
`legacy | publishable | secret`. The screenshot's two tabs are filters over that one list.

Rows show name, description, `prefix`, and a copy control. What is copyable differs by type and the
page must not pretend otherwise:

| Type | What the API returns | What the row can offer |
|---|---|---|
| `publishable` | complete | copy the key |
| `legacy` `anon` | complete | copy the key |
| `legacy` `service_role` | complete, and bypasses RLS | copy, behind the same care the dashboard uses |
| `secret` | prefix + `·` mask | copy the prefix; Reveal is phase 3 |

**The reader picks fields, and `KeySummary` does not change.** `service_role` arrives unmasked and
bypasses Row Level Security; a reader that passes the response through leaks it. That guard already
exists and stays. Its comment is rewritten to the measured truth: the flag masks the *new* secret type
and not the legacy JWT, so the flag was never the boundary — the picked list is.

**This page needs more fields than `KeySummary` carries** — `type`, `description`, and for the
publishable and legacy rows the key itself. That is a second, wider shape with its own name, not a
loosening of the existing one, and it must still exclude `service_role`'s value from anything cached.

**Not cached.** `PART_TTL_MS` gives `api-keys` 60s today for the four fields the database page shows.
A shape carrying real key values must not sit in that cache; if this page reads through the part
endpoint at all, it reads a different part with a TTL of zero.

## Related Code Files

- Create: `app/(app)/p/[ref]/settings/api-keys/page.tsx`, `components/project-settings/api-keys.tsx`
- Modify: `lib/connect-actions.ts` (the bug), `lib/project-parts.ts` (the wider reader and the
  corrected comment), `components/project-settings/settings-nav.tsx` (the row)
- Read for context: `plans/reports/260925-0234-api-keys-measured.md`

## Success Criteria

- [ ] Both tabs render from one request.
- [ ] A `secret` row shows its prefix and mask without claiming to be the whole key.
- [ ] **No response containing `service_role` reaches the browser whole**, and nothing carrying a real
      key value is written to the part cache.
- [ ] The Connect sheet's Server tab works again, and says why the secret is absent rather than
      failing entirely.
- [ ] The nav row lands in **Configuration**, not Security.
- [ ] `pnpm test` still green — 415.

## Risk Assessment

**`service_role` is the whole risk.** It is complete at `reveal=false`, it bypasses RLS, and this page
exists to display keys — so every shortcut here is a shortcut to leaking it. The session that added
`KeySummary` found exactly this defect once already.

**A wider shape is a second chance to get it wrong.** The guard works because one narrow type is the
only thing that crosses the boundary. Adding a second type doubles the surface, which is why it is
named, branded and tested rather than assembled inline.
