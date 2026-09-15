---
phase: 4
title: "Settings as a panel"
status: pending
priority: P2
effort: "3h"
dependencies: [2]
---

# Phase 4: Settings as a panel

## Overview

The settings nav moves out of the content area and becomes its own column against the rail, grouped —
the three-column layout in the screenshot.

## Requirements

- Rail, then a settings nav panel, then the content.
- Two groups with headings: CONFIGURATION and SECURITY.
- Every greyed row still names a real endpoint, and still carries it in `title`.

## The groups

```
CONFIGURATION    General · Infrastructure · Database · API · Authentication · Storage · Domains
SECURITY         Password Manager
```

The screenshot has three groups; two of them — INTEGRATIONS and BILLING — are external links this app
does not have. Password Manager is not filed under configuration because it is not one: it is where a
secret is kept, and after phase 6 of the database-password plan it is also where a database password
can be replaced.

## Architecture

`app/(app)/p/[ref]/settings/layout.tsx` drops its `max-w-5xl` wrapper and becomes a full-height row:
the nav panel, then the section. The project layout does not change — settings builds its own frame
inside the content area it is given.

The page title moves into the content column, beside the section it titles, rather than sitting above
both columns as it does now.

**Only the frame changes.** The rows, their endpoints, the `ready` flags and the `title` attributes
come across as they are: that table is the record of which rows have an endpoint behind them, and it
was verified against the OpenAPI spec rather than remembered.

## Related Code Files

- Modify: `app/(app)/p/[ref]/settings/layout.tsx`, `components/project-settings/settings-nav.tsx`
- Read for context: `components/project-nav.tsx` after phase 2, so the two navs read as one system

## Implementation Steps

1. The nav panel: groups, headings, the existing rows.
2. The layout: three columns, full height, title in the content column.
3. Check both settings routes and the greyed rows' `title` text.
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Success Criteria

- [ ] Settings renders as rail + nav panel + content on both its routes.
- [ ] Both group headings appear; no heading is left standing over an empty group.
- [ ] Every greyed row still names its endpoint in `title`.
- [ ] The settings panel and the rail look like one system rather than two conventions.
- [ ] `pnpm test` still green — 410.

## Risk Assessment

**A heading over nothing.** If a group's rows are all conditional, a heading can outlive its contents.
Two groups, both non-empty today, and the rendering should not assume that stays true.

**Losing the endpoint audit.** The `title` attributes are what make "every greyed row names a real
endpoint" checkable from the page instead of from a plan file. A rewrite of the nav is exactly where
that gets dropped as incidental markup.
