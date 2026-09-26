---
phase: 4
title: "The legacy JWT secret tab"
status: completed
priority: P3
effort: "2h"
dependencies: [1]
---

# Phase 4: The legacy JWT secret tab

## Overview

The second tab: the old HS256 key, what it still signs, and the one thing this app cannot show.

## Requirements

- The legacy key's metadata.
- A plain statement that its secret value is not readable here, and where it is.
- Revoking it, behind the strongest warning on the page.

## Architecture

**The Reveal control in the Supabase dashboard has no public endpoint behind it.**
`GET /config/auth/signing-keys/legacy` returns the same six metadata fields as any other key —
`public_jwk` is null for HS256 and there is no secret field. `/config/auth` has no `jwt_secret`.
The only other path matching "secret" is `/v1/projects/{ref}/secrets`, which is Edge Function
secrets, a different thing. The dashboard reads it through something private.

So this tab shows metadata and says so, the same shape of limitation as the database password.
Saying it plainly is the feature; a disabled Reveal button that never works would be worse than
no button.

**Why revoking it is the heaviest action here.** `anon` and `service_role` are JWTs signed by this
key, with a ten-year lifetime. Revoking it stops them verifying. The API returns 200 with no
warning at all — measured — so the entire caution is this app's to write, and it belongs next to a
link to the API Keys page where those keys are managed.

## Related Code Files

- Modify: `components/project-settings/jwt-keys.tsx` — tab 2
- Create: `components/project-settings/legacy-jwt-secret.tsx`
- Modify: `lib/signing-key-actions.ts` — reuses `revokeKey`

## Implementation Steps

1. The tab renders the HS256 key from the same part — no second request. Its id, status and dates.
2. A short paragraph: the secret value is not exposed by the Management API, with a link to this
   project's dashboard page. No placeholder dots pretending there is something to reveal.
3. The revoke control, offered only when the key is `previously_used`. Its confirm names
   `anon` and `service_role` explicitly, says they stop working immediately, and links to
   `/p/{ref}/settings/api-keys`.
4. If the project has already disabled legacy API keys, that confirm can say so — the
   `legacy-api-keys` part already holds the flag, and "nothing is using these anyway" is the one
   piece of reassurance that is honest here.

## Success Criteria

- [x] Tab 2 shows the HS256 key's metadata and states plainly that the secret is not readable.
- [x] No Reveal button, disabled or otherwise.
- [x] Revoking is gated behind a confirm naming anon and service_role, with the API Keys link.
- [x] A project with no legacy key shows an empty state, not a broken tab.
- [x] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` green — 450 tests.

## Risk Assessment

- **The tab looks like a downgrade from the screenshot.** It is, and deliberately. The line
  explaining why is the mitigation.
- **A project created after late 2025 has no legacy key at all.** Handle the empty case; the API
  keys page already had to.

## What was built differently

**One confirm, two tabs.** The legacy tab's Revoke opens the same `RevokeConfirm` the signing tab
uses — the one that grew the `anon`/`service_role` paragraph in phase 3. A second dialog here would
have been a second revoke path, and the paragraph is the only thing standing between a click and a
silent 200 from the API.

**The tab bar is the frame, not a state.** It renders around the skeleton and around the error, so
the page does not rearrange itself under someone who is already reading it.

**The legacy key stays listed under signing keys too.** It is a signing key; hiding it from that list
to make the second tab feel exclusive would mean the list of this project's keys was incomplete. The
second tab is where it is explained, not where it is kept.

**Which key counts as legacy is "any HS256 key in the list"**, not a second request to
`/signing-keys/legacy`. HS256 is in the create enum so a project could in principle hold one that is
not the original — noted in the component rather than papered over, since in practice the only
HS256 key is the one Supabase made.

**Step 4 was dropped.** The plan said the revoke confirm could read the `legacy-api-keys` flag and
say "nothing is using these anyway" when the project had already disabled `anon` and
`service_role`. It is not built. That reassurance would be the only sentence on the page arguing
*for* an irreversible action, and it would be resting on a flag measured on a different endpoint —
the API keys switch says the project stops *issuing* those keys, not that nothing still holds one.
The tab links to that page instead and lets the reader check.

**No deep link into the Supabase dashboard.** The tab links to the project and says to look under
JWT Keys, rather than guessing a settings path that was never verified.

## What the final review caught

**The dialogs were inside the branches.** `confirms` was rendered in the signing and legacy trees
but not in the loading or error ones, and nothing reset the open-dialog state when the part stopped
being `ready`. That is reachable, not theoretical: a refused read comes back as HTTP 200 with
`{ok:false}` and replaces the data, so a refetch that gets throttled *after a successful revoke*
would unmount the confirm and show "Could not read this project's signing keys" over the top of a
write that had already landed. On an irreversible action that is the worst possible ending. The
component now has one `return`, with the dialogs outside every branch — the shape `api-keys.tsx`
next door already used.

**The revoke confirm said two things that are false for the legacy key.** It is the same dialog for
both cases, and both of its reassurances were written for an asymmetric key:

- *"It is removed from this project's JWKS"* — the HS256 key was never **in** JWKS. It is symmetric
  and has no public half, which the measured report says plainly.
- *"Tokens on this project last {jwt_exp}"* — the tokens hanging off the legacy secret are `anon`
  and `service_role`, which do not expire on that schedule. Printing a waiting period next to the
  legacy warning offers a wait that does not exist, and this page's own code comments call that the
  one mistake with a consequence.

`RevokeConfirm` now branches on the algorithm and says nothing about JWKS or `jwt_exp` in the legacy
case; it says instead that there is no waiting period, and points at the API Keys page.

**Four files were over the 200-line guideline.** Split into `signing-key-list.tsx`,
`create-standby-dialog.tsx`, `revoke-confirm.tsx` and what remains of `jwt-key-dialogs.tsx`.

**Prettier is not adopted.** It was used once to tidy this feature's own files and is not a repo
dependency; the repo has no config and most tracked files would fail the same check. Rather than
leave a half-adopted formatter to churn on the next touch, nothing was added — the feature's files
simply match the width the rest of the repo is written at.
