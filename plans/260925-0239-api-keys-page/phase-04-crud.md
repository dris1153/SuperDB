---
phase: 4
title: "Create, rename, delete"
status: pending
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

## Success Criteria

- [ ] Creating a key with a bad name is refused before the request, with the measured rule stated in
      plain words rather than a regex.
- [ ] An API refusal shows the API's own message.
- [ ] The created key's row appears without a reload, and nothing claims to show a full secret.
- [ ] Deleting requires a confirm that names the key.
- [ ] `type` is offered at creation and nowhere else.
- [ ] `pnpm test` still green.

## Risk Assessment

**A deleted key cannot be restored**, and whatever authenticates with it stops working immediately.
That is the confirm's job to say.

**Client-side validation drifting from the API.** The rule above was measured on one day. It is a
convenience, not a boundary, and the API's message is always what the user sees when the two disagree.
