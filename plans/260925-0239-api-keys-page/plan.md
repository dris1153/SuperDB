---
title: "The API Keys page"
status: in-progress
created: 2026-09-25
blockedBy: []
blocks: []
---

# The API Keys page

`/p/[ref]/settings/api-keys` — the keys a project authenticates with, listed, created, renamed,
deleted, and where possible revealed. Plus the legacy JWT pair and the switch that turns them off.

Design and the measurements behind it:
[260925-0239-api-keys-brainstorm.md](../reports/260925-0239-api-keys-brainstorm.md).
**Read it before starting** — the OpenAPI spec is wrong in two places and the brainstorm says which.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Settle the reveal scope](phase-01-settle-reveal-scope.md) | **done** | ~1h | — |
| 2 | [The list, and the Server tab bug](phase-02-list-and-server-fix.md) | **in-progress** | ~4h | — |
| 3 | [Reveal](phase-03-reveal.md) | **in-progress** | ~3h | 2 |
| 4 | [Create, rename, delete](phase-04-crud.md) | **in-progress** | ~5h | 2 |
| 5 | [The legacy switch](phase-05-legacy-switch.md) | **in-progress** | ~3h | 2 |

**Phase 1 is done, and it answered yes.** `reveal=true` returns the secret complete where
`reveal=false` masks it; the 403s that prompted the question were a token scoped to a different
organization, not a platform limit. Phase 3 is an ordinary feature now, and no longer depends on it.

Phase 2 is independent of everything and carries a bug fix that stands on its own.

## Settled decisions

Do not re-open these during implementation:

- **One endpoint, two tabs.** `GET /api-keys` returns all four keys with a `type`; the tabs in the
  screenshot are filters over one list, not two requests. `/api-keys/legacy` holds only `{enabled}`.
- **Reveal is a real button, not a disabled one.** The 403 is a property of the token's scopes, not of
  the API. A permanently greyed control would make a fixable token problem look like a missing
  feature.
- **No paste-the-secret box.** The database password genuinely cannot be read back, which is why that
  page accepts typed input. This one *can* be read by a token with the right scope, and building a
  paste box would bake today's misconfiguration into the product.
- **`KeySummary` does not change.** `service_role` comes back complete at `reveal=false` and bypasses
  RLS, so the picked-fields guard in `lib/project-parts.ts` stays. Its comment needs rewriting — the
  guard does not.
- **Writes have a burst limit the headers do not describe.** Three writes inside a second gave 201,
  429, 429 while the next read reported 117 of 120 remaining; spaced five seconds apart all three
  succeeded. A 429 on a write means "too fast", not "quota exhausted", and nothing here may batch
  writes without spacing them.
- **Legacy keys are not addressable by id.** `anon` and `service_role` carry an `id` of their own
  name; `GET /api-keys/{id}` answers `400 "id: Invalid UUID"` for them, so they can only be found in
  the list. Nothing in the spec says this, and getting it wrong makes Reveal silently never work for
  `service_role`.
- **A masked secret and a complete one are the same length** — 41 characters either way. Detect the
  mask by its character `·` (U+00B7), never by `.length`. Measured; it would otherwise have shipped.
- **The name rule comes from measurement, not the spec.** 4–64 characters, `^[a-z_][a-z0-9_]*$`. The
  spec declares no 400 at all for these endpoints; the API returns them with precise messages.

## What was measured, in one line each

- A paused project answers `GET /api-keys` with an empty array — not an error. Both projects on this
  account were paused, which made every early reading worthless until one was resumed.
- `reveal=false` masks the new `secret` key (26 of 41 characters) and leaves the legacy
  `service_role` JWT complete. Spec and this repo's earlier note were each half right.
- `reveal=true` → 403 for every truthy spelling, on the list and single-key endpoints alike.
- `POST` → 201 with the key already masked; `DELETE` → 200 with it masked; `hash` is a one-way digest.
- `x-ratelimit-limit: 120` per 60s on both api-keys endpoints.

## Cross-plan notes

**[260911-1030-database-password](../260911-1030-database-password/plan.md)** owns
`app/(app)/p/[ref]/settings/` and `components/project-settings/settings-nav.tsx`. This plan adds a row
to that nav and a route beside its two. Phases 5–7 there are still open and touch none of these files.

**[260915-2303-icon-rail-and-settings-panel](../260915-2303-icon-rail-and-settings-panel/plan.md)**
phase 4 rewrote that same nav into groups. The API Keys row belongs in **Configuration**, not
Security: it lists credentials but the page itself is a management surface, and the Security group is
where the password reset lives.

## Success metrics

- Both tabs render from one request; a key's `type` decides which tab shows it.
- Reveal shows the secret where the connection has the scope, and names the missing scope where not.
- Create rejects a bad name before the request and surfaces the API's own message when it still
  refuses.
- Disabling legacy keys requires typing the project name and states what actually breaks.
- **No response containing `service_role` reaches the browser whole** — the one rule this page cannot
  get wrong.
- The Connect sheet's Server tab works again.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` stay green — 415 tests today.

## Status

Audited 2026-09-26: the page, the reveal path, CRUD and the legacy switch have all shipped and three of the four were verified against the live API when they were written. They stay `in-progress` because the UI itself has not been exercised in a browser.
