---
phase: 4
title: "Raw JSON"
status: in-progress  # built; not looked at in a browser
priority: P3
effort: "1h"
dependencies: [2]
---

# Phase 4: Raw JSON

## Overview

A filter box and syntax colour, which is all the original's third tab has over ours.

## Architecture

**Client side, and small.** `lib/highlight.ts` is Shiki and `server-only`, and
[`plans/260926-0153-cold-start`](../260926-0153-cold-start/plan.md) measured what reaching it costs a
route: 10.4 MB of the 13.4 MB the overview page traces. A user record is a flat object; colouring it
needs a few lines of tokenising, not a highlighting engine.

**The filter hides lines, it does not re-parse.** The original's box narrows a pretty-printed
document, which is the only behaviour worth having — filtering keys out of the object would produce
JSON that is not the record, on the one tab whose job is to show the record as it is.

## Related Code Files

- Modify: `components/auth/user-panel.tsx` — the Raw JSON tab
- Create: `components/auth/json-view.tsx`

## Implementation Steps

1. Pretty-print, then colour keys, strings, numbers, booleans and null.
2. A filter input with a Clear button, matching case-insensitively on the rendered line.
3. Say how many lines are hidden while a filter is on, so a filtered view is never mistaken for the
   whole record.

## Todo List

- [x] Coloured JSON
- [x] Filter and Clear
- [x] A line saying the view is filtered

## Success Criteria

- [x] The record renders coloured, and matches what the API returned.
- [x] Filtering narrows the visible lines and says so.
- [x] No highlighting library is added.

## Risk Assessment

- **A tokeniser that mangles a value** would make this tab lie about the record it exists to show.
  Render from the parsed object rather than from a regex over the whole string.

## Built 2026-09-26

`components/auth/json-view.tsx` renders the record, and `lib/json-line.ts` takes a line apart —
split in two so the part that could mangle a value is testable.

**The risk this phase names is now six assertions.** The obvious way to break a JSON tokeniser is a
`": "` inside a value, which every URL in a user record has:

```
"iss": "https://api.github.com"      ->  key "iss", value "https://api.github.com"
"msg": "request completed: 200, ok"  ->  the document's comma, not the one inside the string
"a\"b": 1                            ->  an escaped quote does not end the key
```

The contract the tests hold to is reassembly: indent + key + separator + value + comma must give
back the original line, character for character.

A value that is not recognised is left uncoloured rather than guessed at — `2026-08-25` is not a
number, and a bracket is not a value.
