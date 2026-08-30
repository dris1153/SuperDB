---
title: "Table Editor polish (group A)"
status: completed
created: 2026-08-30
blockedBy: []
blocks: []
---

# Table Editor polish

Closes the read-only gap between `/p/[ref]/tables` and Supabase's own editor. Everything here is
read-only — no new risk class, no new API surface.

Design and probe findings:
[table-editor-completion-brainstorm.md](../reports/260830-0045-table-editor-completion-brainstorm.md).
Builds on [260829-2223-table-editor-readonly](../260829-2223-table-editor-readonly/plan.md).

## Phases

| # | Phase | Status | Delivers |
|---|---|---|---|
| A1 | [Keys and column menu](phase-01-keys-and-column-menu.md) | **completed** 2026-08-30 | FK navigation, column header dropdown |
| A2 | [Grid ergonomics](phase-02-grid-ergonomics.md) | **completed** 2026-08-30 | Cell copy, reorder, pin, hide, density |
| A3 | [Export and search](phase-03-export-and-search.md) | **completed** 2026-08-30 | CSV/JSON export, cross-column search |
| A4 | [Sidebar and menus](phase-04-sidebar-and-menus.md) | **completed** 2026-08-30 | Collapse, table menu, list filters |

A1 carries the most value and is the only phase whose absence is visible in the reference
screenshot. A4 is the most droppable.

## Coordination

`plans/260830-0045-table-editor-writes` is independent — neither blocks the other logically. But A2
and its phase B2 both edit `components/table-editor/grid.tsx`. **Ship A first**, or expect conflicts.

## Known debt this repays

The read-only plan's phase 2, step 7 specified a column header dropdown (sort, freeze, copy name).
It was not built and the omission was not recorded. A1 closes it.

## Conventions

Unchanged from the read-only plan and not restated per phase:

- Files under 200 lines; pure functions get a `node:test` file beside them.
- Server Components fetch; client components are interactive leaves.
- Every URL write goes through `useTableUrl`, which shares one `useTransition` — there is no
  `loading.tsx` anywhere in this app.
- Identifiers reaching SQL go through `quoteIdent`, values through `quoteLiteral`, integers through
  `clampInt`, and names are validated against the catalog first.
- Header comments explain *why*, matching the surrounding code.

## Definition of done

Every item in the brainstorm's group A list is either built or recorded as dropped with a reason;
`pnpm typecheck` clean; tests pass.
