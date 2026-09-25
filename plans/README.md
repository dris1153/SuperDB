# How to read these plans

One directory per piece of work, named `YYMMDD-HHMM-slug`, holding a `plan.md` and one file per
phase. `reports/` holds the measurements a plan was built on.

The durable view of the codebase is in [`docs/`](../docs/). These files are the record of *how a
piece of work went* — what was believed, what was measured, what changed on the way — and they keep
their mistakes rather than being tidied up afterwards.

## What the statuses mean

They are not a burndown. A phase says how far the work got, and "shipped" and "proven" are not the
same thing here, because most of this app's behaviour can only be proven against a live Supabase
project or a running browser.

| Status | Means |
|---|---|
| `pending` | Nothing has been written. |
| `in-progress` | Started. Often **the code has shipped and nobody has clicked through it** — several phases spell that out in a comment beside the status, e.g. `# code done; the page itself needs the app`. |
| `completed` | Written, and its success criteria were checked. Where a criterion was checked against a live project, the phase file records what the API answered. |
| `blocked` | Waiting on something outside the phase. The blocker is named in the file. |

A plan's own `status:` is the highest of its phases: never `pending` once any phase has started.
Audited 2026-09-26, when six plans still said `pending` over phases that had shipped months of work.

## Auditing them

Comparing a phase's "Related Code Files" against the tree is a good first pass and a bad last one.
When that audit was run, four paths came back missing and none of them was rot:

- `lib/use-optimistic-order.ts` — shipped at `components/use-optimistic-order.ts`, the second of the
  two locations the phase itself offered.
- `lib/table-query.ts` — deliberately deleted; the phase file says so a few lines further down.
- `lib/accounts.ts`, `app/(app)/accounts/page.tsx` — the *old* names, quoted in a phase that
  replaced them with `connections`.
- `supabase/migrations/002-connections.sql` — a migrations directory that was planned and never
  adopted. This repo has one idempotent `supabase/schema.sql` instead.

So: read the phase before believing the diff.

## The schema is deployed by hand

`supabase/schema.sql` is one idempotent file — every block is `if not exists` or a converge step, and
re-running it on a populated database is meant to change nothing. It is pasted into the SQL editor
of **this app's own** Supabase project.

That makes it possible for the code to be ahead of the database it runs against, which is a real
state this project has been in: `saved_queries`, `project_order` and `project_secrets` all arrived
in the file after the last time it was applied. The symptom is a feature that answers with a
deployment message rather than data — `lib/project-parts.ts` has one such reader, which deliberately
refuses to show the Postgres error because `relation "public.saved_queries" does not exist` is a
deployment detail rather than something the user can act on.

See [`docs/deploying-the-schema.md`](../docs/deploying-the-schema.md) for what to run and how to
check what is already there.
