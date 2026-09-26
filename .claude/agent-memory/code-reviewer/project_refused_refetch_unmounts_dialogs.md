---
name: refused-refetch-unmounts-dialogs
description: any refetch can flip a ready part to "refused" because a refusal is a 200 with ok:false — so early-return loading/error branches unmount open dialogs while their open-flags survive
metadata:
  type: project
---

`app/api/projects/[ref]/[part]/route.ts` answers an upstream refusal with **HTTP 200 and
`{ok:false, reason}`**. `components/use-project-part.ts` stores that envelope as TanStack *data*, so
`status` becomes `"refused"` — not `error`. A refused answer therefore **replaces** a previously
good one, including on a background refetch. (A thrown/transport failure does not: `data` is checked
before `error`.)

Consequence for any page whose write path does `await refetch()` while a confirm dialog is open: the
part can leave `"ready"` mid-write. A component that branches with **early returns** and renders its
dialogs only inside the ready branches will unmount them, while the `useState` flags that opened
them (`revoking`, `deleting`, …) survive untouched — so the dialog reappears unprompted if the part
recovers, and the in-flight write's error has nowhere to land.

`components/project-settings/api-keys.tsx` is the pattern that avoids this: one `return`, the
loading/error/empty states as a nested ternary inside it, and `KeyForm` rendered unconditionally at
the bottom of the tree. `components/project-settings/jwt-keys.tsx` (2026-09-25) uses early returns
plus a `shell()` helper instead, which is where this was found.

**Why:** the 200-for-a-refusal is deliberate — the page prints "the OAuth grant is missing the …
scope" rather than an empty card — so this is not going to change; readers have to cope with a ready
part becoming refused at any time.

**How to apply:** on any part-backed component, check that every state that can hold an open dialog
is rendered in *all* branches, and that leaving `"ready"` resets the open-flags. Prefer one return
with the dialogs outside the branch. Related: [[part-ok-true-without-data]],
[[partstate-collapses-disabled-into-pending]], [[null-reads-as-error-not-loading]].
