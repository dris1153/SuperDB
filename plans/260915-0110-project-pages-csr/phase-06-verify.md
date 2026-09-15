---
phase: 6
title: "Measure again, and the states nobody looks at"
status: pending
priority: P1
effort: "2h"
dependencies: [4, 5]
---

# Phase 6: Measure again, and the states nobody looks at

## Overview

The same measurement as phase 1, and a pass over every state that is not the happy path.

## Requirements

- Before/after numbers by the same method, on the same project.
- Every card's pending, settled, refused and failed states seen at least once.
- No token or raw envelope in any response body.

## Architecture

The honest comparison is not "is it faster" — client fetching moves work after hydration, so
time-to-data is expected to be *worse* and time-to-first-paint better. Record both, and say which
moved which way rather than reporting whichever number improved.

Throttle the network to see the states: a fast connection hides every skeleton.

## Related Code Files

- Read: the phase 1 note
- Create: the after-numbers in the same file

## Implementation Steps

1. Re-run phase 1's measurement.
2. Throttle and walk both pages: pending, settled, refused, network failure, expired session.
3. Read the response bodies for a token or an upstream envelope.
4. Record the result, including anything that got worse.

## Success Criteria

- [ ] Before and after numbers in one place, with both paint and data times.
- [ ] Every card seen in all four states.
- [ ] No token and no raw envelope in any body.
- [ ] A revisit inside the stale window issues no new requests — checked in the network panel.
- [ ] Anything that got worse is written down, not omitted.

## Risk Assessment

**Reporting only the number that improved.** First paint will improve and time-to-data will not. Both
belong in the note, or the next person re-opens this decision without the facts.
