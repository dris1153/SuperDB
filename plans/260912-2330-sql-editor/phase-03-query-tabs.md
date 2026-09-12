---
phase: 3
title: "Query tabs"
status: in-progress
priority: P2
effort: "1d"
dependencies: [1, 2]
---

# Phase 3: Query tabs

## Overview

The "+ New" tab bar: several queries open at once, each with its own buffer, surviving a reload.

## The part that needs care

Three state systems interact here, and getting the boundaries wrong is how this becomes hard to
reason about:

| State | Lives in | Lifetime |
|---|---|---|
| Which tabs are open | sessionStorage | the browser tab |
| What is saved | the database | forever |
| Unsaved buffer contents | sessionStorage | the browser tab |

**The table editor already solved this exact shape.** `components/table-editor/tab-bar.tsx` keeps
open tables per project under `superdb:tabs:{ref}`, and `session-store.ts` reads sessionStorage
through `useSyncExternalStore` with a manual listener set — because sessionStorage fires no event in
the tab that wrote it. Reuse both rather than inventing a second mechanism.

## Requirements

**Functional**
- Open several queries, switch between them, close them.
- A new tab starts empty; opening a saved query opens it in a tab.
- Unsaved edits survive a reload.
- A dirty tab is visibly dirty and warns before closing.

**Non-functional**
- No second sessionStorage abstraction. Reuse `session-store.ts`.

## Architecture

Keys follow the existing convention: `superdb:sql-tabs:{ref}` for the open list and
`superdb:sql-buffer:{tabId}` for contents. A tab references either a saved query id or nothing.

**A saved query renamed elsewhere** shows the name it has now, read from the saved list rather than
copied into tab state. Copying it is how two sources of truth start.

**A saved query deleted with a tab open** leaves the tab in place, holding its buffer, no longer
linked. Closing it is the user's decision, not a side effect of a delete somewhere else.

## Related Code Files

- Create: a tab bar component for this route
- Modify: the phase 1 route and editor, to work per tab
- Read for context: `components/table-editor/tab-bar.tsx`,
  `components/table-editor/session-store.ts`, and
  `components/table-editor/column-prefs.ts` for the key-naming convention and its stale-key filtering

## Implementation Steps

1. Read the table editor's tab bar and session store in full before writing anything.
2. Tab list state on the existing store, with convention-following keys.
3. Per-tab buffers; the editor reads and writes the active one.
4. Open-from-sidebar, new tab, close tab with a dirty warning.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
6. Verify: reload with three tabs open and unsaved edits in two of them.

## What was built, where it differs from the plan

- **Keys as planned:** `superdb:sql-tabs:{ref}` holds `{ tabs, activeId }`, `superdb:sql-buffer:{id}`
  holds one buffer. The active tab is in the list key rather than a third one — it is part of the
  same answer and would otherwise be a second thing to keep consistent.
- **`session-store.ts` gained `clearSession`, `subscribeSession` and `readSession`** rather than a
  second store being written. A buffer key is removed when its tab closes, and the dirty dots need
  several keys at once, which no single `useSession` call can express — so that view subscribes to
  the same listener set instead of starting its own.
- **Dirtiness is derived, never stored.** Each tab's buffer is compared against its saved query's
  text, so it is still correct after a reload, where a flag would read false for everything. The
  snapshot's cache signature *is* the result, so an unchanged set keeps its identity and
  `useSyncExternalStore` does not loop.
- **The discard-on-open prompt is gone**, replaced by a warning on close. With tabs, opening a saved
  query opens a tab instead of replacing a buffer, so there is nothing to discard at that moment —
  which is what phase 2's prompt existed to protect.
- **Results are held per tab.** Not in the plan, and not optional: one shared panel shows tab A's
  rows under tab B, and a result read against the wrong statement is how the wrong thing gets run.
  A run pins the tab that asked, so switching tabs mid-flight puts the answer where it belongs.
- **Save as… links the current tab** to the query it just created, so the next Save updates it
  rather than creating a second row.
- **Buffers are written on every keystroke, undebounced.** `sessionStorage` writes are synchronous
  and a statement is kilobytes. A timer would also have to be flushed on switch and on close to be
  correct, which is more to get wrong than it saves.
- Two files were split to stay under the 200-line rule: the sidebar's rows into `query-section.tsx`
  (as the table editor splits `sidebar.tsx` from `table-list.tsx`), and the run flow into
  `use-run-sql.ts`.
- **The arithmetic moved to `lib/sql-tabs.ts` with tests.** Parsing a store someone may have edited,
  choosing the next active tab after a close, and deriving the dirty set are all pure, and `pnpm test`
  only reaches `lib/`. 16 tests; without them this phase had none.

## Review findings, and what came of them

Reviewed 2026-09-13. One Critical, two High, four Medium, seven Low — all fixed or recorded below.

- **Critical: the buffer key had no project ref.** `sessionStorage` is per browser tab, not per
  route, and the first tab of every project was the literal id `t1` — so `superdb:sql-buffer:t1` was
  shared by every project in that browser tab. Typing a statement on project A and navigating to
  project B put A's unsaved statement in B's editor, one click from Run against the wrong database,
  and typing there destroyed it. Every key now carries the ref. The success criterion below tested
  the wrong axis: the risk was two *projects* in one browser tab, not two browser tabs.
- **High: the confirmed write lost its tab.** The first leg pinned the tab that asked; the second
  re-read the active one. Switching tabs while the read-only probe was in flight filed a write's
  outcome under an unrelated tab, underlined an error position in the wrong document, and left the
  tab that ran the write showing "Click Run to execute your query". `confirming` now holds
  `{ tabId, sql }` and the resend carries both.
- **High: the dirty-set cache was module-level**, so two mounted workspaces — which is what a
  navigation between two projects produces — made its signature thrash and handed React a new Set
  on every call. That is an infinite render loop, and one keystroke anywhere was enough to start it,
  because a write notifies every listener. The cache is now per hook instance in a `useRef`, and the
  computation is the pure function in `lib/`.
- **Medium: `pending` was global** while results were per tab, so a run in one tab disabled Run in
  the others and silently swallowed their Mod-Enter. It is now the running tab's id.
- **Medium: a failed `sessionStorage` write was swallowed** with a comment about view preferences —
  written when this store held column widths. It now holds unsaved SQL, where dropping a write means
  an editor that rolls back to nothing on the next tab switch, or, with site data blocked, a Run
  button that never enables at all. The store keeps an in-memory copy, which lasts the page rather
  than the browser tab: a degradation instead of a loss.
- **Medium: mutators wrote from the list as rendered.** Two clicks in one tick both wrote from the
  same stale value and the second undid the first, and closing a tab the store had already dropped
  indexed at −1 and threw. Every mutation reads the store back, and the arithmetic returns the state
  unchanged for a tab it cannot find — with a test.
- **Medium: a tab past the list's 200-row limit** was labelled "Untitled query", which claims it was
  never saved. It now reads "Unlinked query". Save still offers Save as… there, because nothing can
  update a row it cannot see.
- Low, fixed: `link` wrote an unsanitised `activeId`; closed tabs kept their result sets in memory;
  orphaned buffer keys are now swept on close, as `column-prefs.ts` sweeps stale column names;
  duplicate and empty tab ids are dropped in parsing (both tested); `crypto.randomUUID` has a
  fallback, since it needs a secure context and this dashboard is reachable over plain HTTP on a LAN;
  `query-section.tsx` is memoised, for the same reason `results.tsx` is.
- Low, fixed by six lines in the editor: the buffer arrives through `useSyncExternalStore` and the
  editor is loaded on demand, so on a reload it could mount before the stored text reached it, with
  nothing afterwards to put it there. An effect fills an *empty* document only, so it can never
  touch one being typed in.

## Success Criteria

- [ ] **Needs the app.** Several tabs open, switch and close correctly.
- [ ] **Needs the app.** Unsaved contents survive a reload, per tab.
- [ ] **Needs the app.** A dirty tab is marked and warns before closing.
- [x] Renaming a saved query updates its tab label: the label is read from the saved list each
      render, never copied into tab state.
- [x] Deleting a saved query leaves its tab and buffer intact — the tab holds an id, and an id that
      resolves to nothing simply reads as unsaved.
- [x] No second sessionStorage helper. `components/table-editor/session-store.ts` is the only one,
      extended with three exports.
- [x] Two browser tabs on the same project cannot corrupt each other: `sessionStorage` is per
      browser tab by definition. (Which is also why none of this is shared between them.)
- [x] **Two projects in one browser tab cannot corrupt each other either** — the axis the criterion
      above misses, and where the Critical finding was. Every key carries the ref.
- [x] The tab arithmetic is tested: parsing, close-neighbour selection and the dirty set, including
      a corrupt store, duplicate ids and a tab already gone. 16 tests in `lib/sql-tabs.test.ts`.
- [x] `pnpm test` (332), `pnpm typecheck`, `pnpm lint`, `pnpm build` green. Route first load 738KB;
      the CodeMirror chunk is still absent from it.

## Risk Assessment

**A second session-store implementation.** The subtle part of the existing one is that sessionStorage
fires no event in the tab that wrote it, so it keeps a manual listener set. A fresh implementation
will miss that and appear to work until two components share a key.

**Unbounded buffer growth.** Tabs closed without cleanup leave orphaned buffer keys. Remove the key
on close and filter unknown keys on read — `column-prefs.ts` already does exactly this for stale
column names.

**Dirty state across a reload.** After a reload everything is technically unsaved. Compare against
the saved query's text to decide dirtiness, rather than tracking a flag that a reload resets.
