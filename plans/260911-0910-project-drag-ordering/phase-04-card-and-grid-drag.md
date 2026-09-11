---
phase: 4
title: "Card restructure and grid drag"
status: pending
priority: P1
effort: "5h"
dependencies: [2, 3]
---

# Phase 4: Card restructure and grid drag

## Overview

Makes the cards draggable, adds the keyboard path, and wires the whole thing to the order saved in
phase 1.

The largest phase, and the one most likely to be underestimated — not because of the drag, but
because of the markup change underneath it.

## The part that is not obvious

`ProjectCard` is a `<Link>` wrapping the entire card. Drag is not keyboard-operable, so this needs
up/down buttons exactly as the connections table does — and **a `<button>` inside an `<a>` is invalid
HTML**. Browsers recover unpredictably, screen readers announce nonsense, and clicks land on whichever
element won.

So the link has to shrink to the card's content and the buttons sit beside it inside the card. That
changes the markup of the board's primary element, which means re-checking:

- the hover treatment (`group-hover:border-brand-border` is on the `Card`, driven by `group` on the
  `Link` — the `group` has to move)
- the focus ring and tab order, now that a card contains three focusable things
- the click target, which is currently the whole card and will shrink

None of that is hard. All of it is easy to not notice until it looks wrong.

## Requirements

**Functional**
- Dragging a card to a new position persists it.
- The first drag saves the whole order, not just the moved card.
- Up/down buttons reorder from the keyboard.
- Drag and the buttons are available **only** when sort is the default, search is empty, and all
  three filters are unset.
- When unavailable, the board says why.
- A reset returns to connection order.

**Non-functional**
- Uses the phase 3 hook. No second copy of the optimistic state machine.
- Card remains a link to the project; the primary interaction is unchanged.

## Architecture

**Grid drag.** DOM order matches visual order in a grid flow, so neighbours are horizontal:
`allowedEdges: ['left', 'right']`, `axis: 'horizontal'` in `reorderWithEdge`. The vertical case in
`sortable-connections.tsx` is otherwise the same shape.

Import paths, verified in `node_modules` while building the connections drag — the remembered ones
were all deprecated:

```
@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter
@atlaskit/pragmatic-drag-and-drop/utils/combine
@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge
@atlaskit/pragmatic-drag-and-drop-hitbox/util/reorder-with-edge
```

**The drag handle is a grip, not the card.** Making the card draggable stops text selection and
starts a drag from the link. `draggable({ element, dragHandle })` — same fix as the table.

**When drag is off.** One derived boolean:

```ts
const clean = sort === "manual" && q === "" && owner === ALL && status === ALL && tag === ALL;
```

Grip and buttons render only when `clean`. When not, a line explains: *"Reordering is off while the
board is filtered or sorted — clear it to reorder."* The failure this designs out is the silent one,
where a card snaps back with no reason given.

**The sort Select.** The first option's label becomes "My order"; its value can stay as-is so
`lib/project-sort.ts` needs no change beyond the label. Reset is a separate control rather than a
sixth option in the Select — an action that deletes rows does not belong in a list of view modes.
Confirm that reading once the UI is on screen.

## Related Code Files

- Modify: `components/projects-board.tsx` — `clean`, the affordance, the reset, wiring the hook
- Modify: `ProjectCard` within the same file — the link/button restructure
- Modify: `lib/project-sort.ts` — the first option's label only
- Read for context: `components/sortable-connections.tsx` as the working reference for every drag
  call, and `lib/project-order.ts` from phase 2 for the actions

## Implementation Steps

1. Restructure `ProjectCard` first, with no drag at all: shrink the link, move `group`, add the
   buttons as no-ops. Confirm hover, focus and click still behave. **Land this before adding drag**
   so a visual regression has one obvious cause.
2. Wire the buttons to the phase 3 hook and the phase 2 action.
3. Add drag: grip handle, `left`/`right` edges, horizontal `reorderWithEdge`.
4. Add the `clean` gate and the affordance.
5. Add the reset.
6. Relabel the first sort option.
7. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
8. Test with a keyboard alone, and on a touch device — drag will not work on touch, the buttons must.

## Success Criteria

- [ ] Drag a card, reload — the order persisted.
- [ ] The first drag saves every project, verified in the table, not just the one moved.
- [ ] A project created upstream since the last reorder appears last.
- [ ] Reordering is possible with the keyboard alone.
- [ ] Reordering works on a touch device, through the buttons.
- [ ] Drag and buttons are hidden whenever the board is filtered, searched or sorted, and the reason
      is on screen.
- [ ] Reset returns the board to connection order.
- [ ] A failed write does not leave the optimistic order on screen.
- [ ] **No `<button>` inside an `<a>`** — check the rendered DOM, not the JSX.
- [ ] Clicking a card still opens the project; hover and focus still read correctly.
- [ ] `pnpm test` still 285/285.

## Risk Assessment

**Invalid nesting survives every automated check.** `tsc`, `eslint` and `next build` will all pass
with a button inside a link. Only reading the rendered DOM catches it, which is why that is a
criterion.

**Losing the click target.** Shrinking the link can leave dead zones in the card where a click does
nothing. Step 1 exists to catch this before drag muddies the picture.

**Drag in a reflowing grid.** At the `sm` and `lg` breakpoints the neighbour relationship changes.
Test at all three widths; a drop that is correct at three columns can be wrong at one.

**The clean-view gate reads as broken.** A user who keeps a filter on will conclude reordering does
not work. The affordance is the whole mitigation, and it needs to be visible rather than subtle.

**Reset with no confirmation.** It deletes an arrangement that took effort. Either confirm, or make
it clearly labelled and easy to redo — decide with the UI in front of you.
