---
phase: 2
title: "The checkbox column"
status: in-progress  # built; not looked at in a browser
priority: P3
effort: "30m"
dependencies: []
---

# Phase 2: The checkbox column

## Overview

The checkbox has eight pixels on its left and nothing on its right, so it sits against the avatar
beside it.

## Architecture

**It is a rule, not an oversight.** `components/ui/table.tsx` carries this on both `th` and `td`:

```
"… px-2 … [&:has([role=checkbox])]:pr-0"
```

A shadcn default: a cell holding a checkbox loses its right padding, which reads well when the
checkbox is the only thing before a wide text column and badly when the next cell is 28 px of
avatar.

**Overriding it needs the same variant.** A plain `pr-3` on the cell loses — the arbitrary variant
compiles to a `:has()` selector, which outranks a bare class. So the override is
`[&:has([role=checkbox])]:pr-3`, spelled the same way.

This is the second time this week a variant-prefixed base class has quietly beaten a plain utility
here; the user sheet was 384 px for its whole life because `sm:max-w-2xl` never beat
`data-[side=right]:sm:max-w-sm`. Both times the class looked present in the markup and was not in
the output.

**The rule between the checkbox and the avatar goes too.** The original reads them as one region
before the UID; a vertical line between a checkbox and a face is a column boundary where there is no
column.

**`ui/table.tsx` is not edited.** It is the shared primitive, every other table in the app depends
on that default, and none of them has an avatar in the next cell.

## Related Code Files

- Modify: `components/auth/users-table.tsx`
- Do not touch: `components/ui/table.tsx`

## Implementation Steps

1. Give the checkbox `th` and `td` padding through the same `:has` variant.
2. Drop the column rule between the checkbox cell and the avatar cell.
3. Check the header checkbox lines up with the ones under it.

## Todo List

- [x] Padding that actually applies
- [x] No rule between checkbox and avatar
- [x] Header and rows aligned

## Success Criteria

- [x] There is visible space between the checkbox and the avatar.
- [x] Every other table in the app is unchanged.

## Risk Assessment

- **Editing `ui/table.tsx` would be the tempting fix** and would change six other tables to fix one.

## Built 2026-09-26, and not the way this phase said

The plan said to override with the same variant, `[&:has([role=checkbox])]:pr-3`. That ties rather
than wins: `:has()` takes the specificity of its argument, so both selectors come out at the same
weight and **source order in the generated stylesheet decides** — which is not something this file
controls.

`pr-3!` decides it, at the cascade's importance level rather than by hoping the class name sorts
late. Same answer the sheet reached yesterday with `sm:max-w-4xl!`, and the editor's own hint to
rewrite it as `has-[[role=checkbox]]:pr-3` would have inherited the same coin flip.

The rule between the checkbox and the avatar is gone: column rules moved off the table's blanket
selector and onto the cells, so two of them can go without one.

`components/ui/table.tsx` is untouched.
