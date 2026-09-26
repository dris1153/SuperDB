---
name: server-actions-dispatch-serially
description: Next queues client-invoked server actions one at a time; a read done as an action waits behind runSql and other long mutations
metadata:
  type: project
---

Next (16.3 here) sends every client call to a `"use server"` function through the router action queue, one after another (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` ~line 207). A navigation marks the pending action discarded. The caller's promise still resolves; only the router state is dropped.

**Why:** `runSql` (SQL editor) is a server action that can run for as long as the statement timeout. A read done as a server action, such as the account chip's `projectAccess` useQuery, sits on a skeleton until that query finishes. The house convention for client reads is a GET route handler (`use-project-part` → `/api/projects/[ref]/[part]`), and those do run in parallel.

**How to apply:** when a review finds a server action used as a `queryFn` or in a read `useEffect`, flag the head-of-line blocking. Suggest a route handler, or document why the delay is acceptable. Server components calling the same function directly are unaffected.
