---
phase: 5
title: "Database page"
status: pending
priority: P2
effort: "4h"
dependencies: [3]
---

# Phase 5: Database page

## Overview

`/p/[ref]/database` gets the same treatment: five awaited calls become five cards.

## Requirements

- Health, disk, API keys, database overview and the table list each land on their own.
- API keys stay hidden until asked for, exactly as now.

## Architecture

Same shape as phase 4 and no new mechanism. The one thing to keep deliberate is **API keys**:
`listApiKeys(token, ref, reveal)` defaults to not revealing, and the page must not start revealing
them merely because the request moved to the client. The part exposes the unrevealed form only;
revealing stays whatever it is today.

## Related Code Files

- Modify: `app/(app)/p/[ref]/database/page.tsx` and its cards
- Read for context: `lib/mgmt-api.ts` (`listApiKeys`, `getHealth`), phase 4's cards

## Implementation Steps

1. Split into cards.
2. Wire each to its part.
3. Check the API keys path specifically.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Success Criteria

- [ ] Each card lands independently, with a skeleton of the right size.
- [ ] API keys are no more revealed than they are today.
- [ ] The table list's empty and unreadable states still read correctly.

## Risk Assessment

**Reveal by accident.** The keys endpoint takes a `reveal` flag. It must not become reachable from
the browser by adding a query parameter.
