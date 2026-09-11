---
type: brainstorm-report
date: 2026-09-11
scope: sorting the project cards on the board
branch: perf/navigation-latency
head: c4d6581
---

# Sorting the project cards

## Problem statement

The board at `/` offers search and three filters but no sort. Asked for: sorting the project cards,
following on from the connection ordering just shipped.

## Why this is not the connection feature again

The obvious move — copy what the connections table just got — does not transfer. The two look alike
on screen and are nothing alike underneath.

| | Connections | Projects |
|---|---|---|
| Source | a table in this app's database | fetched from the Management API on every load |
| Adding an order column | `alter table` | needs a **new table** keyed `(user_id, project_ref)` |
| Lifecycle | the user creates and deletes them | Supabase does, without telling this app |
| Layout | single-column list | responsive grid, 1/2/3 columns by breakpoint |

Manual drag ordering would therefore need a new table, a policy for rows orphaned when a project is
deleted upstream, a position for projects that appear upstream, a resolution against the connection
grouping shipped in phase 2, and drag inside a grid that reflows at each breakpoint. That is a
project, not a feature.

**Decided: field sort, local state, no persistence.** Roughly 30 lines plus tests, no schema.

## Approaches evaluated

| | Field sort | Manual drag | Group headings |
|---|---|---|---|
| Schema change | none | new table | none |
| Handles upstream create/delete | trivially | needs a policy | trivially |
| Fights connection order | only while sorted, reversible | permanently | no, reinforces it |
| Effort | ~30 lines + tests | days | ~20 lines |

Group-by-connection-with-headings was offered as a fourth option, since it is arguably what "I want
to see my projects organised" really means, and it was already an open question in the connection
ordering report. Not chosen; still worth revisiting if the flat grid reads as arbitrary.

## Recommended solution

A `<Select>` beside the existing filters in `components/projects-board.tsx`, local `useState`,
defaulting to `"connection"`.

| Label | Key |
|---|---|
| **Connection order** (default) | leave the server's order alone |
| Name | `name`, ascending |
| Status | a defined severity order, **not** alphabetical |
| Region | raw `region`, matching what the card prints |
| Newest first | `created_at`, descending |

**The default option earns its place.** The board already sorts by connection order and nothing on
screen says so. Naming it makes the current behaviour visible and gives the sort a way back.

**Status order.** Alphabetical would be a bug wearing a feature's clothes: `ACTIVE_HEALTHY`,
`ACTIVE_UNHEALTHY`, `COMING_UP`, `GOING_DOWN`, `INACTIVE` is not an order anyone wants. Sorting by
status is what you do to find what needs attention, so:

1. Broken — `ACTIVE_UNHEALTHY`, `INIT_FAILED`, `RESTORE_FAILED`, `PAUSE_FAILED`
2. Transitional — `COMING_UP`, `GOING_DOWN`, `PAUSING`, `RESTORING`, `RESTARTING`, `UPGRADING`, `RESIZING`
3. Paused — `INACTIVE`
4. Healthy — `ACTIVE_HEALTHY`
5. Other — `REMOVED`, `UNKNOWN`

This is a judgement call, not a fact. `lib/project-status.ts` has `isPaused` and `isMoving` but no
severity notion, so the ranking is new and should be easy to change.

**Region sorts on the raw code** (`ap-southeast-2`), because that is exactly what `ProjectCard`
prints. Sorting on a prettier label would produce an order that cannot be read off the screen — the
same reasoning that fixed the account column's sort key.

**No tiebreak needed.** `Array.prototype.sort` is stable and the incoming array is already in
connection order, so equal keys keep it for free.

**Where the code goes.** The comparator and the severity table live in `lib/project-sort.ts` with
tests, following the `lib/connection-sort.ts` precedent set hours earlier. The severity map is
exactly the kind of data that rots unnoticed when it is an inline object in a component.

Sorting runs in its own `useMemo` after filtering, so changing the sort does not invalidate the
filter memo.

## Risks

| Risk | Mitigation |
|---|---|
| The severity order disagrees with what the user wants | One table in one file; explicitly flagged as a judgement call |
| Sorting flattens the connection grouping from phase 2 | Intended and reversible; "Connection order" is the default and the way back |
| Nothing persists across a reload | Matches the four controls beside it. Called out so it is a choice, not a surprise |
| A fifth control crowds the filter row | Four already wrap on narrow screens; check the layout at `sm` |
| `status` gains a new value upstream | Unranked values fall to "other" rather than throwing — must be the map's default, and a test |

## Success metrics

- Each option orders the cards as its label says.
- "Connection order" reproduces exactly the order rendered today.
- Projects with equal keys stay in connection order.
- Sorting and filtering compose: sorting a filtered view sorts only what is visible.
- An unrecognised status sorts last instead of throwing.
- `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` stay green (274 tests today).

## Next steps

Small enough to implement directly; no plan file warranted. Order: `lib/project-sort.ts` plus tests,
then the Select in `projects-board.tsx`.

## Open questions

- Whether the status ranking above matches how the user actually triages. Cheap to change once used.
- Whether grouping by connection with headings would serve better than any sort. Carried over from
  the connection ordering report, still unanswered.
