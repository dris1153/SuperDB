---
phase: 2
title: "The panel, rebuilt"
status: pending
priority: P2
effort: "5h"
dependencies: []
---

# Phase 2: The panel, rebuilt

## Overview

The detail panel has the right parts in the wrong order and is missing four attributes. Rebuild it
in the original's layout.

## Requirements

- Tabs at the top, beside the close control.
- Header: display name, then the email with a copy control.
- Eight attribute rows, labels left and values right, each divided.
- Provider Information as a card: icon, name, a sentence, an `Enabled` badge.
- Action rows, each with a description beside its button.
- Danger zone with its warning line and three described rows, `Remove MFA factors` among them.

## Architecture

**The four missing rows are already in the response.** `updated_at`, `invited_at`,
`confirmation_sent_at` and `is_sso_user` are in the body the panel already fetches — the Raw JSON
tab renders them today. Nothing new is read; the Overview tab was written against a shorter list.

**An absent timestamp is a dash, and it means something.** `invited_at: null` on a user who signed
up is not missing data, and the original prints `-`. The note already in the panel about
`email_confirmed_at` being *absent* rather than null on an unconfirmed user applies to this whole
table.

**Remove MFA factors stops being conditional.** Today the section is hidden when `/factors` answers
`[]`, which is most users. The original shows the row always, inside the danger zone. Show it
disabled with the reason — a control that vanishes teaches nobody what it does.

**Two things are deliberately not copied.** "Configure GitHub provider" leads to a providers page
this app does not have, and "Open in Log Explorer" to a logs explorer it does not have either. The
card keeps the badge and drops the button.

## Related Code Files

- Modify: `components/auth/user-panel.tsx` — the rebuild
- Create: `components/auth/user-attributes.tsx`, `components/auth/provider-card.tsx`
- Reuse: `components/auth/provider-icon.tsx` from phase 1 when it exists; a local copy until then
  rather than a dependency between two phases that are otherwise independent

## Implementation Steps

1. Move the tabs above the header; the header gets the name, the email and a copy control.
2. The attribute table: eight rows, mono values, divided, a dash for absent.
3. The provider card: icon, name, the sentence, the `Enabled` badge.
4. Action rows with their descriptions.
5. Danger zone: the warning line, three rows, and the MFA row disabled rather than hidden when there
   are no factors.

## Todo List

- [ ] Tabs and header
- [ ] Eight attribute rows
- [ ] Provider card
- [ ] Described action rows
- [ ] Danger zone with the MFA row always present

## Success Criteria

- [ ] The panel shows `Updated at`, `Invited at`, `Confirmation sent at` and `SSO`.
- [ ] A user with no MFA factor still sees the row, disabled, with a reason.
- [ ] Every action carries the sentence that says what it does.
- [ ] The measured mail warning stays on the two email actions.

## Risk Assessment

- **A rebuild can quietly drop a safety control.** The typed-email delete confirm, the ban dialog
  and the mail sentence all exist for reasons written down in
  `plans/260925-1950-authentication/phase-02-user-lifecycle.md`. They move; they do not go.
