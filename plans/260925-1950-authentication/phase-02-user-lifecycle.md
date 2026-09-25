---
phase: 2
title: "A user, and what can be done to one"
status: completed
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

**Four of these send mail. The quota this phase was designed around does not bite.**

```
POST /admin/generate_link {type: "magiclink"|"recovery"|"invite", email}
```

Measured: `generate_link` set `recovery_sent_at` on the user, so it is not merely minting a link.

**But the two-an-hour limit was not reached.** Nine consecutive sends — magiclink, recovery and
invite — all answered 200 on 2026-09-26. `rate_limit_email_sent = 2` governs user-initiated mail;
the admin endpoint does not appear to spend it. So the warning on these buttons says what is true —
the mail goes out at once and nothing here limits it — rather than naming an allowance that does
not stop anything. The 429 branch stays, because a project with a custom SMTP may still produce
one, and an unhandled one would read as "something went wrong".

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

- [x] The panel shows identities, which the table does not have.
- [x] Creating with auto-confirm produces a confirmed user; without, an unconfirmed one.
- [x] Banning shows as banned, and the same control lifts it.
- [x] Every mail-sending button states the quota before it is pressed.
- [x] A rate-limit refusal says it is the quota, not "something went wrong".
- [x] Deleting asks for the email address.

## Risk Assessment

- **These act on a real project's real users.** Ban and delete are the two with consequences for a
  person, and both confirm.
- **The quota is small enough to be hit by accident.** Saying it up front is the mitigation; there is
  no way to check the remaining allowance.

## Verified against the live project, 2026-09-26

```
create email_confirm=true    200  email_confirmed_at set immediately
create email_confirm=false   200  email_confirmed_at ABSENT, not null
GET /factors                 200  []            (a user with no MFA, not a 404)
PUT ban_duration=24h         200  banned_until set, isBanned true
PUT ban_duration=none        200  banned_until null, isBanned false
generate_link magiclink      200
generate_link recovery       200
generate_link invite         200  creates the user, invited_at set
DELETE /admin/users/{id}     200
```

Probe users only, and the project was left at zero users. Two runs timed out mid-cleanup on a flaky
connection and left users behind; a cleanup pass that deletes only `superdb-probe-` addresses
cleared both, and the retry count was raised after the first.

**Not verified:** whether a delete is soft or hard, and removing an MFA factor — there is still no
enrolled factor to remove, and `/factors` answering `[]` is as far as that goes. The UI offers the
control only when a factor exists, so the untested path is unreachable on a project without MFA.
