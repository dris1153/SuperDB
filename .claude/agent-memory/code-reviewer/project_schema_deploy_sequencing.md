---
name: project-schema-deploy-sequencing
description: SuperDB has no migration runner — supabase/schema.sql is pasted by hand into the Supabase SQL editor, so schema changes are never ordered against app deploys
metadata:
  type: project
---

`supabase/schema.sql` is the whole migration mechanism: one idempotent file, applied manually in the
Supabase SQL editor (README step). There is no `supabase/migrations/`, no CI step, and no ordering
guarantee between running it and shipping the app.

**Why:** the project targets self-hosters who paste the file once. That works for additive setup, but
it means a code change that depends on a new column or function can reach production before the SQL
does, and nothing warns anyone.

**How to apply:** on any review that touches `supabase/schema.sql`, trace every new column/function to
its first reader and ask what that reader does when the object is missing. In this codebase readers
`throw new Error(error.message)` and there is no `app/**/error.tsx`, so a missing object is a 500, not
a degraded page. Check the blast radius through `lib/inventory.ts::resolveProject` — it is the auth
gate for every `/p/[ref]` route and most mutation actions, so one broken query in
`connectionsWithTokens` takes down far more than the page under review. Also verify the file is a true
no-op on re-run against a *populated* DB, not just a fresh one.

Testing note: `pnpm test` is pure-function only (node --test over `lib/**/*.test.ts`); there is no
coverage of `lib/connections.ts` or `lib/inventory.ts`, so none of this class of bug is caught by CI.
