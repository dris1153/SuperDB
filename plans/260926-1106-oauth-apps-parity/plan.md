---
title: "OAuth Apps, against the original"
status: in-progress  # built; not looked at in a browser
created: 2026-09-26
blockedBy: []
blocks: []
---

# OAuth Apps, against the original

Screenshot compared 2026-09-26. Most of the gap is chrome, and one piece is behaviour.

## The structural difference

**When the server is off, this page returns early and replaces everything with a paragraph.** The
original shows the notice *and* the toolbar *and* the table below it, empty. Somebody arriving at a
disabled page can see what they would get; ours shows them a wall of text and hides the feature it
is describing.

## The rest

| | Ours | Original |
|---|---|---|
| Header | title + a sentence of subtitle | title + a **Docs** button |
| Notice | four lines of prose filling the page | a card: icon, one bold line, one sentence, a button on the right |
| Toolbar | one **Add application** button | search, **Registration Type**, **Client Type**, and **New OAuth App** |
| Disabled create | no button at all | the button, disabled, with a tooltip saying why |
| Table head | `Name`, `Client ID`, `Type`… | `NAME`, `CLIENT ID`, `CLIENT TYPE`… uppercase and letter-spaced |
| Empty | a dashed box under the table | a row inside it: *No OAuth apps found* |

## Settled decisions

- **Filtering happens in the browser, and that is correct here.** `GET /admin/oauth/clients`
  returns every client in one response with no paging — the opposite of the users list, where
  filtering client-side would have meant paging an entire project into the browser to search it.
- **The filter options come from the data, not from a list written here.** `registration_type` was
  measured as `manual`; `dynamic` exists in the API's vocabulary but has never been seen from this
  app. Deriving the options from the rows cannot go stale.
- **No per-column sorting.** The original has sort arrows; a list that is usually empty and at most a
  few rows does not need them, and an arrow that sorts three rows is furniture.
- **Both buttons leave the app, and say so.** `Docs` and `OAuth Server Settings` lead to pages this
  app does not have, so they carry an external-link icon rather than pretending to navigate. This is
  a deliberate exception to the rule used for "Configure GitHub provider" and "Open in Log Explorer",
  which were dropped: enabling the server is the only way to use this page at all, so the way there
  has to exist.
- **The measured minute stays.** GoTrue picks the flag up about a minute later, and without that
  sentence the page reads as broken to whoever just enabled it.

## Risks

- **A tooltip on a disabled button never fires.** `pointer-events` are off, so the trigger has to be
  a wrapper rather than the button — otherwise the explanation for why the button is disabled is
  invisible, which is worse than no tooltip.

## Built 2026-09-26

`components/auth/oauth-apps.tsx` rewritten, and the route page reduced to rendering it — the
component owns its header now, because the header carries a Docs link and `PageHeader` has a
subtitle slot and no button slot.

- The notice, the toolbar and the table are always there; the notice appears above them when the
  server is off rather than instead of them.
- Search matches the name and the client id. The two filters are `Select`s with a dashed trigger
  that shows its label until something is chosen, as the original's do.
- `New OAuth App` is present and disabled when the server is off, with its tooltip on a focusable
  wrapper — a disabled button takes no pointer events, so a tooltip on the button itself would never
  open.
- The empty row lives inside the table, and says `No OAuth apps match` rather than `found` when the
  list is not empty but the filters hid everything — the two mean different things.
- Created prints the full timestamp, as the users table does.

One runtime trap checked rather than assumed: `ui/tooltip.tsx`'s `Tooltip` does not carry its own
provider, and Radix throws without one. `app/(app)/layout.tsx` mounts `TooltipProvider` above every
project route, so this page is covered.

## Not verified

The browser. Checked: 560 tests, typecheck, lint, build.
