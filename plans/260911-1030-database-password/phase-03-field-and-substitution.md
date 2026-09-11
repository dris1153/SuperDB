---
phase: 3
title: "Field and substitution"
status: pending
priority: P1
effort: "3h"
dependencies: [1, 2]
---

# Phase 3: Field and substitution

## Overview

The password field in the Connect sheet's Direct tab, and the substitution that turns three
placeholder-carrying connection strings into working ones.

## Requirements

**Functional**
- A password field in the Direct tab, behind the vault gate, saving to the phase 1 table.
- With the vault unlocked and a password saved, the direct, transaction pooler and session pooler
  strings all carry it.
- With the vault locked, all three show the placeholder — today's behaviour.
- The copy button copies whatever the string currently shows.

**Non-functional**
- Substitution happens in the browser. The server never sees plaintext.
- Uses the phase 2 hook. No second copy of the crypto cycle.

## Substitute structurally, not by matching the placeholder

`transactionPooler` and `sessionPooler` come back verbatim from the Management API, and **the
placeholder it embeds is unknown here**. The only literal `[YOUR-PASSWORD]` in the repo is the one
this app writes itself, at `components/connect-sheet.tsx:95`. Matching on it would be a guess about
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

**The blob reaches the client as a prop.** `app/(app)/p/[ref]/page.tsx` builds `ConnectInfo`; add the
ciphertext to it. It is opaque, so passing it to a client component exposes nothing — the same
reasoning that already lets `connection_secrets` blobs reach the credentials form.

**The field sits behind `VaultGate`**, like the credentials form. Locked shows the master-password
prompt; the strings above it keep the placeholder. No separate "locked" branch is needed because the
locked state *is* the current behaviour.

**Say what cannot be checked.** The app has no way to tell a correct password from a typo — the API
never returns it. One line under the field, not a warning icon. Do not build a test-connection
feature to compensate.

## Related Code Files

- Modify: `components/connect-sheet.tsx` — `DirectPanel`, the field, the substitution
- Modify: `app/(app)/p/[ref]/page.tsx` — carry the blob into `ConnectInfo`
- Create: a small pure module for the substitution and its test — it is exactly the kind of string
  handling that should not live inline in a component
- Read for context: `components/connection-credentials.tsx` for the field shape,
  `lib/project-secrets.ts` from phase 1

## Implementation Steps

1. Look at one real transaction pooler string; confirm the URI shape.
2. Write the substitution as a pure function with tests: placeholder replaced, password encoded, a
   string with no userinfo left alone, an empty password left alone.
3. Carry the blob into `ConnectInfo`.
4. Add the field behind `VaultGate`, wired to the phase 2 hook and the phase 1 action.
5. Substitute in all three strings.
6. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
7. Verify by hand — see the criteria.

## Success Criteria

- [ ] All three strings carry the real password when the vault is unlocked.
- [ ] All three show the placeholder when it is locked.
- [ ] Save, lock, unlock, reopen — the same password returns.
- [ ] A password containing `@`, `:` or `/` produces a valid URI.
- [ ] A blob that cannot be decrypted blocks saving.
- [ ] **The server never receives plaintext** — confirm in the network tab, not by reading the code.
- [ ] The copy button copies what is displayed.
- [ ] The substitution has tests covering encoding and the no-userinfo case.
- [ ] `pnpm test` still green.

## Risk Assessment

**A special character breaks the URI.** The most likely real-world failure, and it looks like the
password is wrong rather than mis-encoded. Encoding is a criterion and a test.

**The pooler URI has a different shape.** Structural replacement is shape-dependent. Step 1 exists
for this; a regex that silently matches nothing would leave the placeholder in place with no error.

**Plaintext reaching the server.** The whole property this feature had to preserve. The criterion is
deliberately "inspect the payload" rather than "read the code" — that is the only check that cannot
be satisfied by a plausible-looking implementation.

**Implying the password was validated.** It cannot be. A field that looks like every other validated
field invites the assumption; one line of copy prevents it.

**Plain text on screen.** Accepted deliberately — see the plan. Revisit only if screen-sharing turns
out to matter more than a usable connection string.
