---
phase: 5
title: "The legacy switch"
status: pending
priority: P3
effort: "3h"
dependencies: [2]
---

# Phase 5: The legacy switch

## Overview

`Disable JWT-based API keys` — one flag, both legacy keys, and the widest blast radius on this page.

## What it actually does

`GET /v1/projects/{ref}/api-keys/legacy` → `{"enabled": true}`.
`PUT /v1/projects/{ref}/api-keys/legacy` takes `enabled` as a **required query parameter**, not a body.

One flag covers **both** `anon` and `service_role`. There is no per-key switch.

**`anon` is what nearly every client application in the wild authenticates with.** Turning this off
does not degrade anything — it stops those clients dead. The confirm has to say that, and it gets the
type-the-project-name treatment the database password reset uses, for the same reason.

**Not measured, deliberately.** The only way to find out what disabling does to a live project is to
disable it on a live project. That was not done, and the phase should not pretend otherwise: what is
written here comes from the endpoint shape and Supabase's own documentation, not from having tried it.

## Re-enabling is one call, and that is not the same as undo

`PUT ?enabled=true` restores the flag. It does not restore the requests that failed in between, and it
does not tell anyone whose application broke that it is safe again. The confirm should not soften the
decision by pointing at how easy it is to reverse.

## Success Criteria

- [ ] The current state is read and shown, not assumed.
- [ ] Disabling requires typing the project name.
- [ ] The confirm says `anon` stops working and what that means, without overstating — overstatement
      is what teaches people to click through.
- [ ] Re-enabling is available and does not claim to undo anything.
- [ ] The action is audited through `recordWrite`, like every other write in this app.
- [ ] `pnpm test` still green.

## Risk Assessment

**This is the single most destructive control in the app after the database password reset**, and
unlike that one its effect is instant and total for anyone using the anon key.

**The migration is moving underneath this.** Legacy keys are due to be removed in late 2026 and
masking of the new secret type appeared within the last ten days. A page built tightly around today's
shape will need revisiting, and this switch is the part most likely to change.
