---
title: "Database, against the original: a section, and the Schema Visualizer first"
status: pending
created: 2026-09-26
blockedBy: []
blocks: []
---

# Database, against the original: a section, and the Schema Visualizer first

`/database` is a dashboard the original does not have — four stats, service health, a table list,
API key names. The original is a **section with its own nav** (Schema Visualizer, Tables, Functions,
Triggers, …) that opens on the Schema Visualizer. This plan builds the section and that one page;
the other rows ship greyed with the endpoint behind each, as Authentication's did.

Read from the original's source, not only the screenshot:
`apps/studio/components/interfaces/Database/Schemas/` — `SchemaGraph.tsx`, `SchemaTableNode.tsx`,
`Schemas.utils.ts`, `DefaultEdge.tsx`, `SchemaGraphLegend.tsx`, `useExportSchemaToImage.ts`.

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [The section: nav, redirect, what happens to the dashboard](phase-01-section.md) | pending | ~2h | — |
| 2 | [The catalog read](phase-02-catalog.md) | pending | ~2h | — |
| 3 | [The canvas](phase-03-canvas.md) | pending | ~5h | 1, 2 |
| 4 | [Copy and download](phase-04-export.md) | pending | ~3h | 3 |

## Settled decisions

- **The old dashboard goes.** Stats repeat the Overview's database card, API key names repeat
  Settings › API Keys. The table list becomes a stand-in **Tables** page until that page is rebuilt
  against the original. Service health moves to the Overview.
- **`@xyflow/react` + `@dagrejs/dagre`**, as the original: pan, zoom, drag, minimap and a layout
  engine, against a hand-written SVG canvas that would re-implement all four. Loaded only on this
  route.
- **`html-to-image`** for PNG and SVG, as the original.
- **Per-table menu**: View in Table Editor, Copy name, Copy as SQL, Copy as Markdown. No *Edit
  table* — this app has no side-panel table editor to open.
- Node positions persist per project and schema in `localStorage`, as the original's do. Auto layout
  asks first, because it discards them.

## Already measured (2026-09-26, read only, SuperDB)

One catalog statement answers the whole graph for a schema — tables, columns with their flags, and
foreign keys as column pairs:

```
public  201  2415 ms   8 KB    8 tables,  9 relationships
auth    201  1991 ms  35 KB   27 tables, 24 relationships
```

`typname` gives the original's type labels exactly: `int8`, `uuid`, `timestamptz`, `_text`, and an
enum's own name (`factor_type`). Foreign keys into another schema arrive with their target schema —
`public.*.user_id → auth.users.id` — which the original draws as a small label node.

## Risks

- **The largest dependency this route has taken.** `@xyflow/react` is ~1.2 MB unpacked. Mitigation:
  loaded on this page only, and the other routes' first load measured after the build.
- **A schema with hundreds of tables** is the original's problem too; it pages. This does not in the
  first version.
