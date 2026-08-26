# Brainstorm — per-project workspace: sidebar + Overview

Date: 2026-08-25 · Status: design approved, not implemented

## Request

Rebuild the project detail page to match the Supabase dashboard as closely as possible: a per-project
sidebar and an Overview page. This round covers the sidebar and Overview only.

## What this actually commits to

Up to now the app has been an inventory: which projects exist, under which account. This turns it into
**a second Supabase dashboard**. The sidebar alone advertises thirteen surfaces.

The good news from the research is that most of them are backed by real endpoints — this is weeks of
work, not an impossible one. But it is weeks, and it should be entered deliberately rather than
drifted into.

## Decisions

| Question | Decision | By |
|---|---|---|
| Layout inside a project | Collapse the main sidebar to an icon rail, add a 240px project panel | user |
| Nav items to list now | All thirteen; unbuilt ones disabled with "soon" | user |
| Overview scope this round | Full, including the request charts | user |

Advisor recommended shipping only nav items that have content, on the grounds that dead navigation
teaches people the app is broken. The user chose disabled-with-label instead, which keeps the roadmap
visible without producing empty pages — a reasonable middle. **`Integrations` should be dropped from
the list entirely**: unlike the others it has no endpoint at all, so it can never be enabled.

## API feasibility — measured against the spec, not assumed

| Overview element | Endpoint | Verdict |
|---|---|---|
| STATUS | `GET /v1/projects/{ref}` | works, already used |
| COMPUTE | `GET /billing/addons` → `selected_addons[].type = compute_instance` | works; absence means the free `NANO` default |
| RECENT BRANCH | `GET /branches` | works |
| LAST MIGRATION | `GET /database/migrations` → `[{version, name}]` | works |
| LAST BACKUP | `GET /database/backups` → `{region, pitr_enabled, backups[]}` | works |
| **GITHUB** | — | **impossible: the Management API exposes no GitHub integration endpoint.** Drop the tile. |
| Total requests | `GET /analytics/endpoints/usage.api-requests-count` → `{result:[{count}]}` | works |
| Request charts | `GET /analytics/endpoints/usage.api-counts?interval=` | works. `interval` accepts `15min\|30min\|1hr\|3hr\|1day\|3day`, which is exactly the time-range picker. |
| Per-service warnings/errors | `GET /analytics/endpoints/logs?sql=` | works — runs SQL/LQL over the unified log stream |
| CPU / RAM | `GET /analytics/endpoints/metrics` | **Prometheus exposition format, not JSON.** Needs a small parser. |
| Disk % | `GET /config/disk/util` | works on access tokens, **401 over OAuth** (measured earlier) |
| API keys | `GET /api-keys` | **403 over OAuth** without `Secrets: Read` (measured earlier) |

The OAuth gaps are the same asymmetry the project page already handles: skip the call, say why.

## Layout

```
┌────┬──────────────────┬────────────────────────────────┐
│ ▣  │ Project Overview │  breadcrumb: org · project     │
│ ▤  │ Table Editor     │                                │
│ ▥  │ SQL Editor       │  ┌──────────┐  ┌────────────┐  │
│    │ ─────            │  │ tiles    │  │ Primary DB │  │
│ 48 │ Database    240  │  └──────────┘  └────────────┘  │
│ px │ Authentication   │                                │
│    │ …                │  charts                        │
└────┴──────────────────┴────────────────────────────────┘
```

`components/sidebar.tsx` is already a client component reading `usePathname()`, so it can collapse
itself on `/p/`. Icon-only mode wants tooltips — `tooltip.tsx` has been installed and unused since the
shadcn migration.

Routes become nested:

```
app/(app)/p/[ref]/layout.tsx   project nav panel + breadcrumb
app/(app)/p/[ref]/page.tsx     Overview
app/(app)/p/[ref]/database/    the tables list that lives on the detail page today
```

### The duplicate-fetch trap

Both the layout and the page need the project, and `resolveProject()` fans out one API call per
connection to find which one owns the ref. Called twice per navigation that doubles.

Fix: wrap it in React's `cache()` so both callers share one result within a render pass. Worth doing
before the second consumer exists, not after.

## Navigation

Grouped as Supabase groups them. Everything except Overview and Database ships disabled.

```
Project Overview     ✅ this round
Table Editor         soon — readable via SQL; editing rows needs Database: Write
SQL Editor           soon — the query endpoint is already in use
─────
Database             ✅ existing tables list moves here
Authentication       soon — config yes; user list via SQL on auth.users
Storage              soon — GET /storage/buckets
Edge Functions       soon — GET /functions
Realtime             soon — only GET /config/realtime exists
─────
Advisors             soon — works over OAuth, measured
Observability        soon — the Prometheus endpoint
Logs                 soon — analytics/endpoints/logs
─────
Project Settings     soon
```

`Integrations` omitted: no endpoint, so it would be permanently disabled.

Keeping Database live rather than Overview-only reuses the tables/health/keys work already on the
current detail page instead of deleting it.

## Overview composition

- **Header** — project name, `https://<ref>.supabase.co` with copy, status badge
- **Five tiles** — status, compute, recent branch, last migration, last backup
- **Primary Database card** — region (city + flag from a static region map), compute variant, then
  CPU/RAM from Prometheus, disk from `config/disk/util`, connections from the SQL overview already
  written
- **Charts** — total requests, success rate, per-service series with the interval picker

Most free-tier projects will show "No branches / No migrations / No backups". That is exactly what
Supabase itself shows, so the sparseness is faithful rather than a bug.

### Performance

A full Overview fires roughly ten API calls. They must run in parallel behind the existing `safe()`
wrapper, and the charts should sit behind a Suspense boundary so the tiles paint without waiting on
analytics — the slowest call should not hold the fastest hostage.

### Charts

Load the `dataviz` skill before writing any chart code. Library choice is deliberately left to
implementation: hand-rolled SVG keeps the dependency count at zero and suits flat sparklines, while
shadcn's chart wrapper brings Recharts and matches the rest of the component set. Decide with the
skill's guidance rather than up front.

## Risks

| Risk | Note |
|---|---|
| Scope | Thirteen surfaces is a product, not a feature. This round is two of them. |
| Ten calls per page load | Parallel + Suspense; watch the p95 before adding more |
| Prometheus parser | Text format, easy to get subtly wrong — needs unit tests over a captured sample |
| OAuth gaps | Disk and API keys stay unavailable; the page must degrade, not error |
| Disabled nav | Ten greyed items risk reading as broken; the "soon" label has to be unmistakable |
| Region → city map | Static and will drift as Supabase adds regions; fall back to the raw region string |

## Success criteria

- The rail collapses on `/p/` and expands elsewhere, with tooltips in icon mode
- `resolveProject` runs once per navigation, not twice
- Tiles render before the charts resolve
- An OAuth-connected project shows the Overview without disk or API keys, and says why
- No navigation item leads to an empty page
- `tsc`, `pnpm test`, `next build` stay clean

## Next steps

1. `cache()` around `resolveProject`, then the nested layout and the icon rail
2. Project nav with disabled states
3. Overview header and the five tiles
4. Primary Database card, including the Prometheus parser plus tests
5. Charts, after loading the `dataviz` skill
6. Move the existing tables list to `/p/[ref]/database`
