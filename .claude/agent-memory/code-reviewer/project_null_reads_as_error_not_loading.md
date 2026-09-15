---
name: null-reads-as-error-not-loading
description: table-editor presentation components treat a null prop as "could not read", so passing null while a query is pending renders a hard error message as the loading state
metadata:
  type: project
---

`workspace.tsx` renders `Could not read {schema}.{table}` for `rows === null`, and `definition.tsx`
renders `No definition could be reconstructed` for `ddl === null`. Both were written against the
server page, where null could only ever mean a failed `safe()` call — there was no "not yet".

**Why:** with TanStack and no `placeholderData`, a query key change (sort, page, filter, table) drops
back to `pending` with `data === undefined`. Mapping that to the same `null` the failure path uses
makes every interaction flash a hard error before the data lands.

**How to apply:** when converting a server page here, a prop that used to mean "read failed" needs a
third value, or the query needs `placeholderData: keepPreviousData`. Do not accept "it resolves in
200ms" — these are the components users stare at. Related:
[[partstate-collapses-disabled-into-pending]].
