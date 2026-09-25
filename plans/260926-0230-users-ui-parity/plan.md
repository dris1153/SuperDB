---
title: "Users page: parity with the original"
status: in-progress
created: 2026-09-26
blockedBy: []
blocks: []
---

# Users page: parity with the original

The Users page works and does not look like the thing it copies. Six screenshots compared, and the
differences are in [260926-users-ui-parity-brainstorm.md](../reports/260926-users-ui-parity-brainstorm.md).

Most of it is display — a truncated UID, a lowercase text badge where the original shows a provider
icon, `2026-08-25` where the original shows `Tue 25 Aug 2026 09:40:19 GMT+0700`. Some of it is
missing structure: no checkbox column, no avatar, four attribute rows absent from the panel. One
piece is a different data source: the Logs tab.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [The table, and its toolbar](phase-01-table.md) | **in-progress** | ~6h | — |
| 2 | [The panel, rebuilt](phase-02-panel.md) | pending | ~5h | — |
| 3 | [The Logs tab](phase-03-logs-tab.md) | pending | ~2h | 2 |
| 4 | [Raw JSON](phase-04-raw-json.md) | pending | ~1h | 2 |

Phases 1 and 2 are independent — different files, different data.

## What the measurement settled

- **`auth_logs` carries `user_id` in `log_attributes`.** Thirteen rows for the measured user, and
  `status`, `path`, `msg` and `level` are selectable directly. This app's own
  `docs/authentication.md` says the opposite; correcting it is part of phase 3.
- **The original merges two log sources.** One row in its list reads `| Login` with no status and no
  path — that is `auth_audit_logs` among the request rows.
- **`Provider type` has no field behind it.** `providerTypeOf` invented `OAuth`/`Basic Auth`; the
  original says `Social`. The vocabulary moves to Supabase's.

## Settled decisions

- **The search-field dropdown changes behaviour, not just the placeholder.** One `?filter=` exists
  and it is a substring match, so Email and Phone send it — and UID reads the user directly through
  `GET /admin/users/{id}`, which is a lookup rather than a search.
- **Nothing links to a page this app does not have.** "Configure GitHub provider" and "Open in Log
  Explorer" are not copied.
- **Bulk delete confirms and reports per row.** N requests, no undo, real accounts.

## Two gates

Phase 1 opens with one measurement and phase 3 with another. Both can remove a control from this
plan rather than change how it is built:

1. If the admin users endpoint has no sort parameter, "Sorted by user ID" does not ship — sorting
   one page of fifty is wrong as soon as there are two pages.
2. If the log endpoint refuses the merged two-source query, the Logs tab runs two requests or keeps
   one source.
