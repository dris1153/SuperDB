---
name: readonly-refusal-proves-little
description: SQLSTATE 25006 from the read-only query endpoint is a command-class refusal, so probes that treat it as "the statement is valid" verify almost nothing
metadata:
  type: project
---

A 25006 from `/database/query/read-only` only proves the statement *parsed*. It does **not** prove
names resolved, types matched, or that the statement would succeed on the write endpoint.

**Why:** Postgres rejects read-only violations by command tag before the command runs — the docs say
"all CREATE, ALTER, and DROP commands" are disallowed, and the message the endpoint returns
("cannot execute CREATE TABLE in a read-only transaction", see `lib/sql-error.test.ts`) is built
from the tag alone. So `alter table public.does_not_exist …` also answers 25006, never 42P01, and
`create index concurrently …` answers 25006 instead of the 25001 it would hit inside the write
endpoint's implicit transaction (`docs/table-editor-measurements.md`: multi-statement requests are
atomic).

**How to apply:** when a probe script or a plan claims DDL was "verified" because it came back 25006,
treat that claim as unproven and say so. The only statements a read-only probe really verifies are
the ones that return rows. Anything DDL needs the write endpoint against a throwaway object, or an
explicit note that it is unverified.

Related: [[tests-cover-lib-only]], [[action-error-text-redacted]]
