---
name: mgmt-path-interpolation-is-unencoded
description: call() in lib/mgmt-api.ts interpolates ids into the URL path with no encoding, and fetch collapses ../ — every server action must validate an id before passing it
metadata:
  type: project
---

Every `lib/mgmt-api.ts` helper builds its path with a template literal and `call()` does
`fetch(BASE + path)` with no `encodeURIComponent`. The WHATWG URL parser resolves `../` segments at
parse time, so an unvalidated `id` reaching one of these helpers lets the caller redirect the request
to **any** Management API path — verified: six `../` from
`/v1/projects/{ref}/config/auth/signing-keys/{id}` lands back at the API root. `?` in an id injects
query parameters too.

`resolveProject(ref)` does NOT protect against this: it only validates `ref`
(`isProjectRef` = `/^[a-z]{20}$/`), and the traversal happens in the segment after it. The audit line
still names the `ref` that was checked, not the project the request actually hit.

**Why:** the token is the user's own connection token, decrypted server-side and never sent to the
browser (`stripSecrets`). So this is a confused deputy — the user drives a credential they cannot
otherwise obtain, past the app's own project check.

**How to apply:** in any `"use server"` module, an `id` parameter that ends up in an mgmt-api path
must be shape-checked first. The established repo pattern is `isAddressableById` in `lib/api-keys.ts`
(a UUID regex) — `removeKey`, `renameKey` and `revealApiKey` all gate on it. Treat a new action that
interpolates an id without a gate as a finding. See [[action-error-text-redacted-in-prod]] for what
the browser actually sees when one of these fails.
