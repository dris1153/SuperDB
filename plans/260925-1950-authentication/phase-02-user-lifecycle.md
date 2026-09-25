---
phase: 2
title: "A user, and what can be done to one"
status: pending
priority: P2
effort: "1d"
dependencies: [1]
---

# Phase 2: A user, and what can be done to one

## Overview

The details panel, and the seven actions the screenshot offers. Four of them send email; two cannot
be undone.

## Requirements

- A panel with Overview and Raw JSON, opened from a row.
- Create a user, with and without auto-confirm. Invite one by email.
- Send a magic link. Send a password recovery email.
- Remove MFA factors. Ban for a duration. Delete.

## Architecture

**The panel fetches its own user.** A listed user has `identities: null`; only a single read returns
them, with `provider`, `identity_data` and `last_sign_in_at`. The Provider Information block in the
screenshot is built from that, so the panel cannot be rendered from the row it was opened from.

**Fields appear as the state does.** `email_confirmed_at` and `confirmed_at` are absent entirely on
a user created with `email_confirm: false`, rather than null — so "Confirmed at" is a dash for a
reason, not a missing value.

**Four of these send mail, and the quota is two an hour.**

```
POST /admin/generate_link {type: "magiclink"|"recovery"|"invite", email}
```

Measured: `generate_link` set `recovery_sent_at` on the user, so it is not merely minting a link.
`rate_limit_email_sent` is **2** on this project with default SMTP. Every button that sends must say
so before it is pressed, and a rate-limit refusal must be shown as what it is rather than as a
generic failure.

**Ban is an update, not an endpoint.**

```
PUT /admin/users/{id} {ban_duration: "1h"}     bans
PUT /admin/users/{id} {ban_duration: "none"}   lifts it
```

So the same control does both, and the panel reads `banned_until` to know which it is showing.

**Delete is the only irreversible one**, and it takes the typed-name friction this app uses
elsewhere — here the email address, since that is what identifies a person.

## Related Code Files

- Create: `components/auth/user-panel.tsx`, `user-dialogs.tsx`, `user-actions-card.tsx`
- Create: `lib/auth-user-actions.ts`
- Modify: `lib/auth-api.ts`, `lib/auth-users.ts`

## Implementation Steps

1. A part for one user, keyed by id.
2. The panel: Overview with the fields from the screenshot, then Provider Information, then the two
   email actions, then a danger zone.
3. Raw JSON — the whole user object, which is the one view that cannot go stale in meaning.
4. Create and invite, behind the split button the original uses.
5. The email actions, each stating the quota and reporting a 429 as a quota problem.
6. Ban, with a duration, and the same control lifting it.
7. Remove MFA factors, offered only when there are factors — `/factors` answers `[]` otherwise.
8. Delete, with the email typed to confirm.

## Success Criteria

- [ ] The panel shows identities, which the table does not have.
- [ ] Creating with auto-confirm produces a confirmed user; without, an unconfirmed one.
- [ ] Banning shows as banned, and the same control lifts it.
- [ ] Every mail-sending button states the quota before it is pressed.
- [ ] A rate-limit refusal says it is the quota, not "something went wrong".
- [ ] Deleting asks for the email address.

## Risk Assessment

- **These act on a real project's real users.** Ban and delete are the two with consequences for a
  person, and both confirm.
- **The quota is small enough to be hit by accident.** Saying it up front is the mitigation; there is
  no way to check the remaining allowance.
