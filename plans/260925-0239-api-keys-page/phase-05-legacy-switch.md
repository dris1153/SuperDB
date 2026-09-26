---
phase: 5
title: "The legacy switch"
status: in-progress  # code done; the switch itself is deliberately unmeasured
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

## What landed

- `lib/mgmt-api.ts` — `getLegacyKeys`, `setLegacyKeys`. The `PUT` takes `enabled` as a **query
  parameter**, which is one of the two places the earlier research summary was wrong and the spec was
  right.
- `lib/project-parts.ts` — a `legacy-api-keys` part, TTL zero: a stale copy would draw the switch in
  the position it was in before the click.
- `lib/api-key-actions.ts` — `setLegacyKeysEnabled`, audited on **both** outcomes.
- `components/project-settings/legacy-keys.tsx` — the card, and the type-the-project-name confirm.

**Audited before the outcome is returned, and on failure too.** This is the widest-reaching switch on
the page; a change nobody can find afterwards is worse than one that failed.

**The confirm does not mention that it reverses.** Re-enabling is one call, and saying so in the
dialog would invite clicking through it. What it says instead is that the effect is immediate and
that turning it back on does not undo what broke in between — which is the true part.

## Deliberately not measured

Every other claim on this page was checked against the live API. This one was not.

The only way to learn what disabling does to a project is to disable it on a real project, and the
only projects available are the user's own. So `PUT /api-keys/legacy?enabled=false` has **never been
sent** from here. What is implemented comes from the endpoint's shape — `GET` was measured and answers
`{"enabled": true}` — and from Supabase's documentation.

That leaves three things unverified, and they are the three worth knowing:

- whether the `PUT` answers with the new state or something else,
- what it does on a project where legacy keys were never issued (projects created since late 2025 do
  not get them),
- and whether re-enabling really restores the same `anon` key or issues a different one. **If it
  issues a different one, "re-enable" is a far larger action than this page currently implies.**

/p/[ref]/settings/api-keys 694,219 to 697,925 bytes.

## Success Criteria

- [x] The current state is read and shown, not assumed — from `GET`, which was measured.
- [x] Disabling requires typing the project name.
- [x] The confirm says `anon` stops working and what that means, without overstating — and without
      softening it by mentioning that it reverses.
- [x] Re-enabling is available and does not claim to undo anything.
- [x] The action is audited through `recordWrite`, on success and on failure.
- [ ] **Not measured, and not going to be here.** That disabling does what this page says it does.
- [ ] **Needs the app.** The card, both states, and the confirm.
- [x] `pnpm test` still green — 430.

## Risk Assessment

**This is the single most destructive control in the app after the database password reset**, and
unlike that one its effect is instant and total for anyone using the anon key.

**The migration is moving underneath this.** Legacy keys are due to be removed in late 2026 and
masking of the new secret type appeared within the last ten days. A page built tightly around today's
shape will need revisiting, and this switch is the part most likely to change.
