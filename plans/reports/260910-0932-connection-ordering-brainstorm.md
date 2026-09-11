---
type: brainstorm-report
date: 2026-09-10
scope: connection ordering — manual order plus column sort
branch: perf/navigation-latency
head: c0760f6
---

# Connection ordering

## Problem statement

The connections table renders in `created_at` order and offers no way to change it. Wanted: a manual
order the user controls, plus sortable columns, with the manual order also driving the projects board.

Decided with the user, all four at the expensive end of their axis:

| Axis | Choice |
|---|---|
| Kind of ordering | manual **and** column sort |
| Scope | connections table **and** the board |
| Interaction | drag and drop |
| Storage | a new database column |

Three concerns were raised before approval and the design was approved as presented; the drag-and-drop
choice therefore stands as the user's decision, not an unexamined default.

## What was verified

- `lib/connections.ts::listConnections` selects with `.order("created_at")` — matches the table.
- `public.connections` has no ordering column.
- No drag-and-drop package is installed; the only UI dependency is Radix.
- `lib/inventory.ts::loadInventory` sorts projects `owner.localeCompare(...) || orgName || name`.
- `components/projects-board.tsx` only **filters** (`rows = projects.filter(...)`). The three `.sort()`
  calls at lines 23–25 build the filter dropdowns, not the rows. So the server's order reaches the
  screen unchanged, and changing `loadInventory` will be visible immediately.

## The design conflict worth naming

Manual order and column sort cannot both be active. With the table sorted by Owner A→Z, dragging row
three to the top has no correct `sort_order` to write.

Resolution, matching how Linear, Notion and Jira handle it: **manual order is the default view; a
column sort overrides it and disables dragging**, with a visible "Sorted by Owner — clear to reorder"
affordance. Without that, a user drags a row and watches it snap back, with no explanation.

## Approaches evaluated

### Interaction: drag vs arrow buttons

| | Drag and drop | Up/down buttons |
|---|---|---|
| New dependency | yes (~30–40 KB) | none |
| Touch | needs library support | works |
| Keyboard / a11y | needs explicit handling | free |
| Code | moderate | ~20 lines |
| Feel | better, at four rows barely noticeable | plainer |

**Recommended arrows. User chose drag.** Proceeding with drag; the recommendation is recorded here so
the trade is visible if the dependency later feels heavy.

Hand-rolled HTML5 drag events were considered and rejected: they break on touch and are poor for
keyboard users, and this codebase is otherwise careful about both.

### Writing the new order: loop vs RPC

| | Loop of updates | Postgres function |
|---|---|---|
| Atomic | no | yes |
| Round trips | N | 1 |
| Partial failure | scrambled order | impossible |

**Chosen: a Postgres function.** `lib/vault-actions.ts::rotateVault` already contains a non-atomic
update loop, recorded as a defect in
[`260910-0028-whole-project-scout.md`](./260910-0028-whole-project-scout.md). Repeating that shape in
new code would be knowingly reintroducing a known flaw. The repo already has a precedent for a
function (`delete_own_account`).

```sql
create or replace function public.reorder_connections(ids uuid[])
returns void language sql security invoker as $$
  update public.connections c
     set sort_order = array_position(ids, c.id)
   where c.user_id = auth.uid() and c.id = any(ids);
$$;
```

`security invoker` so the existing "own connections" RLS policy still applies — unlike
`delete_own_account`, this needs no elevation.

### Sort state: URL vs storage

**Chosen: URL** (`?sort=owner.asc`), matching the table editor's existing wire format. The page is a
server component, so the URL is where "what data is shown" already lives in this codebase, and it
stays shareable.

## Recommended solution

**Schema** — add `sort_order int` to `public.connections`.

- Named `sort_order`, not `position`: `POSITION` is a standard SQL function name and reads ambiguously
  unquoted.
- Idempotent migration in `supabase/schema.sql`, per the file's existing converge blocks.
- Backfill `row_number() over (partition by user_id order by created_at)`.
- **No unique constraint on `(user_id, sort_order)`** — rewriting a whole ordering passes through
  transient duplicates, which a constraint would reject.
- Index on `(user_id, sort_order)` for the ordered read.

**Writes** — `reorder_connections(ids uuid[])` as above, called from a server action that also
`revalidatePath("/")` and `revalidatePath("/connections")`.

**New connections** — `lib/connections.ts::write` sets `sort_order = max + 1` on the insert branch
only, so re-authorizing never reshuffles the list (same rule that already protects `display_name`).

**Board** — `connectionsWithTokens()` orders by `sort_order`; `loadInventory` drops
`owner.localeCompare` and sorts only *within* a connection (`orgName`, then `name`). `perConnection`
is already built in connection order and `.flat()` preserves it.

**Table UI** — sortable Owner, Kind, Account, Added. Tags and Token do not sort meaningfully. Drag
handles disabled whenever a column sort is active.

## Risks

| Risk | Mitigation |
|---|---|
| Board order changes visibly for existing users | Intended, and stated up front |
| Drag disabled during sort is confusing | Explicit "Sorted by X — clear to reorder" affordance; a silent no-op is the failure mode |
| Backfill leaves nulls for rows added mid-migration | `sort_order` nullable with nulls ordered last, or default 0; decide when writing the migration |
| Reorder races a concurrent connect | The function is one statement; a new row lands at max+1 and may need one re-drag. Acceptable |
| dnd-kit unmaintained or API-changed | **Verify at install time.** Do not trust this report or training data on package health — check the repository's recent activity and the current major version before adding it |
| Reordering while filtered/searched | Not applicable to the connections table (no filters), but re-check if filters are added |

## Success metrics

- Drag a connection to a new position, reload — order persists.
- The board's project order follows the connection order.
- A column sort disables dragging and says so; clearing it restores the manual order.
- A newly connected account appears last, and re-authorizing an existing one does not move it.
- Re-running `supabase/schema.sql` on a populated database is a no-op.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` stay green.

## Next steps

1. Schema: column, backfill, index, function. Verify the migration is idempotent against a populated
   database.
2. Read path: `connectionsWithTokens` order, `loadInventory` sort, `write` assigning `sort_order`.
3. Reorder server action plus the RPC call.
4. Drag UI, then column sort with drag disabled while sorted.

Steps 1–3 are useful on their own: they give a stable, controllable order even before any drag UI
exists. Worth shipping as its own commit.

## Open questions

- Whether `sort_order` should be `not null default 0` or nullable with nulls last. Decide against the
  backfill, not in advance.
- Whether the board should group projects under a connection heading now that order is meaningful.
  Out of scope; note it if the flat list looks arbitrary once ordering lands.
- Whether column sort is still wanted after manual ordering exists. It may turn out redundant with
  four connections — worth re-checking before building step 4.
