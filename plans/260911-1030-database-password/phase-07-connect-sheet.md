---
phase: 7
title: "Connect sheet"
status: in-progress  # code done; blocked on the schema for end-to-end proof
priority: P2
effort: "3h"
dependencies: [5]
---

# Phase 7: Connect sheet

## Overview

The clipboard half. Three connection strings carry `[YOUR-PASSWORD]`; a second Copy button puts the
real one on the clipboard without ever putting it on the screen.

This is the old phase 3 with its field removed — that moved to the Password Manager in phase 4 — and
its display decision reversed. Everything it worked out about *how* to substitute is unchanged and
kept below.

## The reversed decision

The original plan settled this:

> **The password appears in plain text** whenever the vault is unlocked and the Direct tab is open,
> unlike every other vault field. Deliberate: a connection string with the password masked is not a
> connection string. Masked-by-default with a reveal toggle is a one-line change if it turns out to
> matter.

**Reversed 2026-09-15.** It turned out to matter. The reasoning still holds — which is why the answer
is not a mask but a clipboard: the string on screen keeps its placeholder and stays readable as a
*shape*, while the working version goes straight to where it is actually used.

## Requirements

**Functional**
- A second button beside Copy, rendered **only** when the vault is unlocked *and* this project has a
  stored password.
- It copies direct, transaction pooler and session pooler strings with the real password substituted.
- The visible strings never change. Vault locked or nothing stored: the second button is absent, and
  the sheet behaves exactly as it does today.

**Non-functional**
- Substitution happens in the browser. The server never sees plaintext.
- The substitution is a pure, tested module — not inline in a component.

## Substitute structurally, not by matching the placeholder

`transactionPooler` and `sessionPooler` come back verbatim from the Management API, and **the
placeholder it embeds is unknown here**. The only literal `[YOUR-PASSWORD]` in the repo is the one
this app writes itself, at `components/connect-sheet.tsx:105`. Matching on it would be a guess about
the other two.

All three are URIs of the shape `scheme://user:password@host:port/db`. Replacing the segment between
the last `:` of the userinfo and the `@` works whatever the placeholder says, so the unknown
disappears rather than needing verification.

```
/^([a-z+]+:\/\/[^:@/]+:)[^@]*(@)/i
```

**`new URL()` was considered and rejected.** The `[` and `]` in the current placeholder sit in the
userinfo, where the parser is lenient and may percent-encode — a spec-compliant parser is less
predictable here than a narrow regex.

**Still look at one real pooler string** before writing the replacement. Not to learn the
placeholder — that no longer matters — but to confirm the URI shape. Structural replacement is
placeholder-independent, not shape-independent.

**Encode the password.** A database password may contain `@`, `:` or `/`, any of which would break
the URI it is spliced into. `encodeURIComponent` on the value before substitution; note it, because a
password that works when pasted into psql and fails in a connection string is a maddening bug to
find.

## Architecture

**`ConnectInfo` is no longer built where the old phase said.** It is assembled client-side in
`components/project-overview/connect-panel.tsx:31` since the CSR work; `app/(app)/p/[ref]/page.tsx` is
still the right place to *read* `projectSecret(ref)`, but the blob travels through `<ConnectPanel>`.
Note the cost honestly: that adds one read of this app's own database to a shell whose entire purpose
(`app/(app)/p/[ref]/page.tsx:13-23`) is to stop waiting on anything. The alternative is a new part;
rejecting it is fine, doing so silently is not. It is opaque, so passing it to a client component exposes nothing — the same
reasoning that already lets `connection_secrets` blobs reach the credentials form.

**No vault gate here.** Phase 4 owns entering the password; this phase only consumes what is already
stored. A locked vault means the button is absent, not that the sheet demands a master password from
someone who only wanted to read a hostname.

**Nothing is written on this page**, which is what makes it the cheap half of the feature.

## Related Code Files

- Create: a pure substitution module and its test
- Modify: `components/connect-sheet.tsx` — the second button in `DirectPanel`, **and the copy at
  `:197-208`**, which currently says resetting the password *"lives in the Supabase dashboard"*. After
  phase 6 that sentence is false. Check the README line the plan overview mentions for the same claim.
- Modify: `app/(app)/p/[ref]/page.tsx` — carry the blob into `ConnectInfo`
- Read for context: `components/project-settings/password-manager.tsx` (phase 4)

## Implementation Steps

1. Look at one real transaction pooler string; confirm the URI shape. **Substitution runs after the
   `:6543` to `:5432` port swap in `connect-panel.tsx:28`, never before.**
2. The substitution as a pure function with tests: password substituted, password encoded, a string
   with no userinfo left alone, an empty password left alone.
3. Carry the blob into `ConnectInfo`.
4. The second button, shown only when unlocked and stored.
5. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
6. By hand: copy, paste into `psql`, connect. **This needs a password that actually works** — which,
   by this plan's own argument, most people only have after phase 6. Do not tick this with a made-up
   string.

## What landed

- `lib/connection-string.ts` + 8 tests — `withPassword`, structural and encoded.
- `app/(app)/p/[ref]/page.tsx` reads the blob; `connect-panel.tsx` carries it into `ConnectInfo`;
  `connect-sheet.tsx` decrypts it in the browser and offers the second Copy button.
- `README.md` — the claim that resetting "stays in Supabase's own dashboard" is no longer true.

**The substitution is placeholder-independent.** The two pooler strings come back verbatim from the
Management API and what they write where the password goes is not knowable here — the only literal
`[YOUR-PASSWORD]` in the repo is the one this app writes for the direct string. Matching on it would
have been a guess about the other two. Replacing whatever sits between the last colon of the userinfo
and the `@` works whatever it says, and the test that proves it uses a deliberately odd placeholder.

**The pooler's username is why a naive pattern fails.** It is `postgres.{ref}` — a dot inside the
userinfo — so splitting on the first colon would eat it. There is a test for that shape specifically.

**`#` is the character that matters.** It opens a URI fragment, so an unencoded one silently truncates
the connection string and the failure looks like a wrong password rather than a mis-encoded one.
Phase 6's generator avoids the whole class by being alphanumeric; this covers typed passwords, which
can be anything.

/p/[ref] first load: 829,707 to 830,755 bytes.

## Success Criteria

- [ ] **Blocked on the schema.** With the vault unlocked and a password stored, the second button
      copies a working string for all three connection types.
- [x] The real password never appears on screen — the visible strings are unchanged, and the button
      renders only when a decrypted password exists.
- [x] Vault locked, or nothing stored: the button is absent and the sheet is untouched. Both reduce
      to the same condition — `useVaultSecret` yields nothing without a key.
- [x] A password containing `@`, `:`, `/` or `#` produces a valid URI — tested, `#` included.
- [ ] **Needs the app.** The server never receives plaintext — confirmed in the network tab.
- [x] The substitution has tests covering encoding, the pooler's dotted username, the port-swapped
      session string, an unknown placeholder and the no-userinfo case.
- [x] `pnpm test` still green — 410, eight of them new.

## Risk Assessment

**A special character breaks the URI.** The most likely real-world failure, and it presents as "the
password is wrong" rather than "the password was mis-encoded". Encoding is a criterion and a test.
Phase 5's generator avoids it for generated passwords; this covers typed ones.

**The pooler URI has a different shape.** Structural replacement is placeholder-independent, not
shape-independent. Step 1 exists for this: a regex that silently matches nothing leaves the
placeholder in place with no error at all.

**Plaintext reaching the server.** The property this whole feature had to preserve. The criterion is
deliberately "inspect the payload" rather than "read the code" — the only check that a
plausible-looking implementation cannot satisfy by accident.

**A button that appears when there is nothing to copy.** Shown only when unlocked *and* stored; either
condition alone makes it a button that does nothing.
