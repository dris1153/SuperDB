---
name: part-ok-true-without-data
description: a part reader returning undefined ships {"ok":true} with no data key, and PartState types data as non-nullable T — so every .length/.field on ready data is an unguarded deref
metadata:
  type: project
---

`call()` in `lib/mgmt-api.ts` ends with `text ? JSON.parse(text) : undefined`, so an empty 200 body
from Supabase resolves a reader to `undefined`. `NextResponse.json({ ok: true, data: undefined })`
serialises to `{"ok":true}` — `JSON.stringify` drops undefined properties — and
`useProjectPart` then returns `{ status: "ready", data: undefined as T }` because `PartState<T>.data`
is declared non-nullable and the body is cast, never validated.

The server-rendered pages this work replaces were written null-safe (`health && health.length > 0`),
so the same response printed a fallback sentence. In a client component it throws a TypeError during
render and `app/(app)/p/[ref]/error.tsx` replaces the whole route.

**Why:** the trust boundary moved. On the server a bad shape was one page's problem; in the browser
every card shares one error boundary, and nothing between the reader and the render validates.

**How to apply:** on every new part-backed component, check each `state.data.<x>` on the `ready`
branch — `Array.isArray(...)` for list parts, `?.` for object parts — and check whether the reader
can return `undefined`/`null`. Also note `attempt()` (`lib/safe.ts:34`) puts a raw non-MgmtError
`Error.message` into `reason`, so a reader's own TypeError is rendered as UI copy.
Related: [[mgmt-api-types-are-subsets]], [[tests-cover-lib-only]].
