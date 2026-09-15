---
name: action-error-text-redacted
description: Error messages thrown from this app's "use server" actions never reach the browser in production — the codebase-wide setError(e.message) pattern renders React's opaque digest string instead
metadata:
  type: project
---

Every mutation path in this app throws (`throw new Error(error.message)` in `lib/*.ts`) and the
client catches and renders the message (`setError(e instanceof Error ? e.message : "…")` — the
pattern repeats in `confirm-action.tsx`, `use-optimistic-order.ts`, `edit-connection.tsx`,
`connection-credentials.tsx`, the table-editor sheets). In a production build React replaces a
rejected server-action message with *"An error occurred in the Server Components render. The
specific message is omitted in production builds…"*, so the carefully worded validation text is
dev-only. `lib/sql-editor-actions.ts::runSql` is the one place that returns errors as values
(`RunResult`) instead, which is why the SQL editor's error surface actually works.

**Why:** it is framework behaviour, invisible in the diff, and it silently downgrades every
user-facing validation message the author wrote. Verified against the `react-server-dom-*`
production bundles under `node_modules/next` (Next 16.3.x).

**How to apply:** when a review adds a `"use server"` mutation whose thrown message is meant to be
read by a user, say so once and point at the return-a-value precedent — do not demand a refactor of
the existing call sites, the convention predates any single change. Conversely, this also means a
raw Postgres error message is not a production data leak on these paths. See
[[project-schema-deploy-sequencing]] for the other standing trap, whose visible symptom is exactly
one of these opaque errors.
