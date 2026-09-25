---
phase: 2
title: "Saying the bars are a sample"
status: completed
priority: P2
effort: "1h"
dependencies: [1]
---

# Phase 2: Saying the bars are a sample

## Overview

After phase 1 the figures cover the whole window and the bars cover whatever fits in 1000 rows. On a
busy project those are different ranges, and nothing on screen says so.

## Requirements

- When the sample is capped, the panel names the range the bars actually cover.
- When it is not capped — the common case on a quiet project — nothing extra appears.
- The line describes the bars, and never contradicts the figures above them.

## Architecture

The sample comes back newest first, so its oldest row is where the bars begin. A sample of exactly
1000 rows means the window was cut; anything less means it was not.

`readPart("logs")` gains `sampledFrom: number | null` — the oldest timestamp when capped, null
otherwise. Null is the whole of the "nothing to say" case, so the panel has one thing to branch on.

Wording sits under the carousel, in the muted style the empty-state card already uses:

> Bars cover the last 12 minutes. Totals cover the full window.

`lib/format.ts` has `timeAgo(iso)`, which phrases a past moment — "12 minutes ago" — and reads
wrong inside "Bars cover the last …". A four-line `span()` in the panel covers it instead.

**Do not shrink the chart to the covered range.** It was considered and rejected in the brainstorm:
the x-axis would stop matching the interval the reader chose in the picker, which is a worse lie
than a labelled sample.

## Related Code Files

- Modify: `lib/project-parts.ts` — `sampledFrom` in the `logs` payload
- Modify: `components/project-overview/usage-panel.tsx` — the line, and the `Usage` type
- Read for context: `components/service-carousel.tsx` — where the bars end and the line begins

## Implementation Steps

1. `sampledFrom` computed in the reader from the sample's oldest `timestamp`, null when under the
   cap. It belongs there rather than in the component: the cap is an API fact.
2. The panel renders the line only when `sampledFrom` is not null.
3. Check the empty-window case still reads as empty: zero rows is not a cap.

## Todo List

- [x] `sampledFrom` in the payload
- [x] the line under the carousel, muted, only when capped
- [x] an empty window still reads as empty rather than as a sample

## Success Criteria

- [x] A capped read names the range the bars cover.
- [x] An uncapped read shows no extra line.
- [x] An empty window shows the empty-window copy, not the sample copy.

## Risk Assessment

- **Exactly 1000 rows without the window being cut** is possible and would show the line for a read
  that lost nothing. Harmless — the sentence stays true, it just says something obvious.
- **Two sentences about coverage on one panel** would read as an error rather than a note. Only one
  of the empty line and the sample line can appear at a time.
