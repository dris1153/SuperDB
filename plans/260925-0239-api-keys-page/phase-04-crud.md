---
phase: 4
title: "Create, rename, delete"
status: in-progress  # code done and verified against the API; the UI needs the app
priority: P2
effort: "5h"
dependencies: [2]
---

# Phase 4: Create, rename, delete

## Overview

New publishable key, new secret key, rename, and delete — with the validation rules that were measured
rather than read.

## The rules the spec does not contain

The OpenAPI document declares **no 400 at all** for these endpoints. The API returns them, with
precise messages:

| Body | Response |
|---|---|
| `{}` | `type: Invalid option: expected one of "publishable"\|"secret", name: Invalid input: expected string, received undefined` |
| `{type:"secret",name:""}` | `name: Too small: expected string to have >=4 characters` |
| `{type:"secret",name:"Bad-Name"}` | `name: Name must start with a lowercase letter or an underscore, followed only by lowercase alphanumeric characters or underscore` |
| `{type:"secret",name:"a"*200}` | `name: Too big: expected string to have <=64 characters` |

So: **4–64 characters matching `^[a-z_][a-z0-9_]*$`**, and `type` is one of two values, set at
creation and **not changeable** — `PATCH` accepts only `name`, `description`, `secret_jwt_template`.

A 5,000-character `description` was accepted, so there is no measured ceiling on that field.

**Validate in the client and let the API refuse anyway.** The client rule is there so a typo is caught
before a round trip; the API's own message is what gets shown when it still refuses, because the rule
above is a snapshot of behaviour and the API is the authority on itself.

## The created key is already masked

`POST` answers **201** with `api_key` masked the same way the list is — there is no one-time reveal at
creation through this API. A "copy your key now, you will not see it again" flow would be a lie.
Whether the *dashboard* shows it once is a question for phase 1's note, not an assumption here.

`DELETE` answers 200 with the deleted key, also masked, and takes optional `was_compromised` and
`reason` query parameters. Deleting a key breaks whatever is using it, with no undo — it gets a
confirm naming the key, in the shape the rest of this app uses.

## What landed

- `lib/api-keys.ts` — `nameProblem`, the measured rule, with 3 tests including the cases that look
  fine and are not: a leading digit, a hyphen, an uppercase letter, a space.
- `lib/mgmt-api.ts` — `createApiKey`, `updateApiKey`, `deleteApiKey`.
- `lib/api-key-actions.ts` — `createKey`, `renameKey`, `removeKey`.
- `components/project-settings/key-dialogs.tsx` — the form and the delete confirm.
- The two create buttons, and pencil/trash on each editable row.

**The name is checked in three places and only one of them is the boundary.** The form checks as you
type, because the rule is not guessable and the API states it only after a round trip. The action
checks again, because it is a `"use server"` export and every one of those is an endpoint any
signed-in browser can call. And when the API disagrees with both, **its message is what the user
sees** — the rule here is a snapshot of one day's behaviour, not a law.

**Legacy keys are not editable, and the code says why rather than hiding the buttons on a hunch.**
Their id is their own name, the API has no `PATCH` for them, and the actions refuse before reaching
the network.

**After a write the list is refetched, not patched.** The API assigns the id, the prefix and the
mask; constructing a row locally would put something on screen that is not the row.

**Verified against the live API**, create → rename → delete, on a real project, and the list returned
to its original four keys.

## A limit the headers do not describe

Those three calls fired back to back inside a second gave `201`, **`429`**, **`429`** — while the next
`GET` reported 117 of 120 remaining. Spaced five seconds apart, all three succeeded.

So there is a burst limit on the write path that the rate-limit headers do not reflect, and nothing in
the spec mentions it. **A 429 on a write here means "too fast", not "quota exhausted".** The first
attempt also left a key behind — the rename and delete both failed after the create succeeded — which
is exactly the state a retry loop would produce, and the page must not batch writes without spacing
them.

/p/[ref]/settings/api-keys 659,813 to 694,219 bytes.

## Success Criteria

- [x] Creating a key with a bad name is refused before the request, with the measured rule stated in
      plain words rather than a regex.
- [x] An API refusal shows the API's own message.
- [ ] **Needs the app.** The created key's row appears without a reload.
- [x] Nothing claims to show a full secret — `POST` returns it already masked, so there is no
      "copy it now" moment to build.
- [x] Deleting requires a confirm that names the key.
- [x] `type` is offered at creation and nowhere else.
- [x] `pnpm test` still green — 430, three of them new.

## Risk Assessment

**A deleted key cannot be restored**, and whatever authenticates with it stops working immediately.
That is the confirm's job to say.

**Client-side validation drifting from the API.** The rule above was measured on one day. It is a
convenience, not a boundary, and the API's message is always what the user sees when the two disagree.
