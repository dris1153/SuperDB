---
phase: 1
title: "The section: nav, redirect, what happens to the dashboard"
status: pending
priority: P2
effort: "2h"
dependencies: []
---

# Phase 1: The section

## Overview

Database becomes a section with a second-level nav, as Authentication is, and `/database` opens on
the Schema Visualizer.

## Requirements

- `components/database/database-nav.tsx` in the shape of `auth-nav.tsx`: the original's groups and
  rows — *Database Management* (Schema Visualizer, Tables, Functions, Triggers, Enumerated Types,
  Extensions, Indexes, Publications), *Access Control* (Policies, Roles), *Configuration*
  (Settings), *Platform* (Backups, Migrations). Unbuilt rows greyed, each naming its endpoint.
- `app/(app)/p/[ref]/database/layout.tsx`: nav and content, `h-full`, padding in the pages.
- `/database` redirects to `/database/schemas`.
- `/database/tables`: the old table list, as a stand-in.
- Service health moves onto the Overview.
- Removed: `stats.tsx`, `api-keys.tsx`, and the `api-keys` part if nothing else reads it.

## Success Criteria

- [ ] `/p/[ref]/database` lands on the Schema Visualizer route.
- [ ] The nav marks the current row; greyed rows say what they would call.
- [ ] Nothing the old page showed is lost that is not shown elsewhere.
