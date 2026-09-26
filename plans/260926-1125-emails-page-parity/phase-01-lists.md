---
phase: 1
title: "The shell and the template lists"
status: pending
priority: P2
effort: "3h"
dependencies: []
---

# Phase 1: The shell and the template lists

## Overview

Replace the single long page with a header, two tabs, and — on the Templates tab — two card lists
that lead to editors.

## Requirements

- Header: `Emails` and the sentence under it.
- Underline tabs, `Templates` and `SMTP Settings`, held in the URL.
- *Authentication*: six rows — name, one-line description, a chevron to that template's page.
- *Security*: seven rows — name, description, a switch, a chevron; one `Save changes` for the card,
  enabled only when a switch has moved.

## Architecture

**The catalogue grows from six to thirteen.** `lib/auth-config.ts` lists the six flow templates;
the seven notification templates join it with their measured field names
(`mailer_subjects_*_notification`, `mailer_templates_*_notification_content`) and the switch field
each one pairs with. One catalogue, so the list, the editor route and the save action cannot
disagree about what exists.

**The descriptions are the original's wording**, one per row — "Ask users to confirm their email
address after signing up" and so on — kept in the catalogue beside the label rather than in the
component.

**The Security switches keep the existing save path.** `saveNotifications` already sends only the
seven boolean fields, which matters because a PATCH mixing kinds can refuse one and apply another.

**Rows are links, not buttons.** The chevron row navigates to `/p/[ref]/auth/emails/[key]`; a link
is what middle-click and a new tab expect.

## Related Code Files

- Modify: `lib/auth-config.ts` (+ test) — thirteen templates, descriptions, the switch per notification
- Modify: `components/auth/emails-page.tsx` — header, tabs, lists
- Delete: `components/auth/email-templates.tsx` — the inline editor moves to phase 2's page
- Modify: `components/auth/smtp-settings.tsx` — `SecurityNotifications` becomes the Security card

## Implementation Steps

1. Extend the catalogue; test that every template's two fields are distinct and follow the measured
   naming, and that every notification names a switch field that exists.
2. The header and the tabs, with `?tab=` in the URL.
3. The Authentication card: six link rows.
4. The Security card: seven rows with switches, one Save.

## Success Criteria

- [ ] Thirteen templates in the catalogue, each field name matching the measured ones.
- [ ] The tab survives a reload.
- [ ] Moving a switch enables Save; saving sends only the switches.

## Risk Assessment

- **Deleting the inline editor before phase 2 lands leaves templates uneditable.** Phases 1 and 2
  ship together, or the old editor stays until the new one exists.
