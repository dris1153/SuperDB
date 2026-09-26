---
phase: 2
title: "A page per template"
status: pending
priority: P2
effort: "5h"
dependencies: [1]
---

# Phase 2: A page per template

## Overview

`/p/[ref]/auth/emails/[key]` — one template, edited on its own page, as the original has it.

## Requirements

- Breadcrumb `Emails › Confirm sign up`, the title, the description, a `Docs` link out.
- Subject input.
- Body with a `Source` / `Preview` toggle; Source is a code editor with line numbers and HTML
  colouring, Preview is the sandboxed frame this page already has.
- `Template variables`: the chips for *this* template, inserting at the cursor.
- `Reset template` on the left, `Save changes` on the right — Reset only if gate 1 passes.

## Architecture

**The route key is checked against the catalogue before anything reads.** `[key]` is a URL segment
and reaches a server action's field lookup; an unknown key is a 404, never a field name.

**The editor is CodeMirror, reused.** `components/sql-editor/editor-theme.ts` already maps this app's
tokens onto an editor surface, and the SQL editor has solved dark mode, focus and sizing once. The
body editor takes the same theme and `@codemirror/lang-html` in place of SQL. Loaded dynamically, the
way the SQL editor is, so the Emails list does not carry an editor it does not show.

**Chips insert where the cursor was.** Whichever of subject and body was focused last receives the
text at its selection — an input through `setRangeText`, the editor through a transaction. A chip
clicked with neither ever focused goes to the body, which is where variables almost always belong.

**Which chips, per template, comes from Supabase's documentation** (gate 3), kept in the catalogue
beside the fields. A variable offered for a template that never receives it renders as literal text
in somebody's inbox.

**Reset is gated** (gate 1). Measure on a scratch project how a template returns to its default —
empty string, `null`, or not at all — and whether `mailer_templates_custom_contents` flips back. If
none of them works, the button does not ship: writing an empty subject would send blank mail.

**Save keeps the rule the current editor already follows**: subject and body together, and nothing
else in the same PATCH.

## Related Code Files

- Create: `app/(app)/p/[ref]/auth/emails/[key]/page.tsx`
- Create: `components/auth/template-editor.tsx`, `components/auth/html-editor.tsx`
- Modify: `lib/auth-config.ts` — variables per template
- Modify: `lib/auth-config-actions.ts` — reset, if gate 1 passes
- Modify: `package.json` — `@codemirror/lang-html`
- Reuse: `components/sql-editor/editor-theme.ts`

## Implementation Steps

1. Gate 1: measure a reset on a scratch project, restoring what was there.
2. Gate 3: the variables for each of the thirteen templates, from the docs, with the source noted.
3. The route, validated against the catalogue.
4. The HTML editor, themed and dynamically loaded.
5. Source / Preview, chips with cursor insertion, Save; Reset if it passed.

## Success Criteria

- [ ] Every one of the thirteen templates opens, edits and saves.
- [ ] An unknown key 404s.
- [ ] A chip lands at the cursor in whichever field had it.
- [ ] Reset either restores the default, measured, or is not there.

## Risk Assessment

- **An editor that drops or reorders characters** corrupts a template that goes to every user. The
  body is the editor's document verbatim; nothing post-processes it before Save.
- **A new dependency on a page used rarely.** Dynamic import keeps it off every route but this one.
