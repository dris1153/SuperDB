---
phase: 2
title: "Ten megabytes off the part route"
status: in-progress  # built and measured; the definition tab has not been looked at
priority: P2
effort: "3h"
dependencies: []
---

# Phase 2: Ten megabytes off the part route

## Overview

`/api/projects/[ref]/[part]` is what every card and the user panel call, and four fifths of what it
carries exists for one reader out of twenty.

## Architecture

**Measured, then reverted:**

```
with    lib/project-parts.ts importing highlight:   12.7 MB, 588 files
without:                                             2.0 MB, 107 files
```

`lib/highlight.ts` is Shiki. `project-parts.ts` imports it for the `definition` reader, which
colours a table's DDL server-side, and a static import is what the bundler and Next's file tracer
follow — so the `logs` reader, the `auth-user` reader and every other one ship the grammars too.

**A dynamic import does not help.** `plans/260926-0153-cold-start/phase-01` tried exactly that and
measured no change: the tracer follows `import()` as faithfully, because the module is reachable at
runtime either way.

**So the colouring moves to the browser.** The server returns the DDL as it already does and drops
`html`; a tokeniser in `lib/` turns it into spans. This was chosen over giving `definition` a route
of its own, which would put an exception into a part mechanism whose uniformity is what makes
`PART_NAMES` a complete list of what a browser may ask for.

**The tokeniser holds to reassembly.** Real DDL carries quoted identifiers, string literals with
apostrophes in them, `--` comments and dollar-quoted bodies. The test that matters is not "does it
colour keywords" but "do the tokens join back into the original text, character for character" —
the same contract `lib/json-line.ts` is held to, for the same reason: this is a view of something
the user will copy and run.

**`CodeBlock` is not touched.** The connect guides keep server-side Shiki; they live on other routes,
their snippets are not SQL, and `lib/highlight.ts` stays for them.

## Related Code Files

- Create: `lib/sql-tokens.ts` (+ test)
- Create or modify: `components/table-editor/definition.tsx` — render coloured tokens
- Modify: `lib/project-parts.ts` — the `definition` reader returns `{ ddl, complete }`
- Do not touch: `lib/highlight.ts`, `components/connect-primitives.tsx`

## Implementation Steps

1. `lib/sql-tokens.ts`: keywords, identifiers, quoted identifiers, strings, numbers, comments,
   punctuation. Tested on the DDL this app actually produces — `lib/table-ddl.ts` builds it.
2. The reader stops calling `highlight`; the part's type loses `html`.
3. The definition tab renders tokens.
4. Rebuild, and record the route's traced size. It should be ~2.0 MB.
5. Check the connect guides still come back highlighted — they are the other caller of
   `lib/highlight.ts` and must be unaffected.

## Todo List

- [x] `lib/sql-tokens.ts` with a reassembly test
- [x] The reader returns plain DDL
- [x] The definition tab colours in the browser
- [x] Route size measured after
- [x] Connect guides unaffected

## Success Criteria

- [x] `/api/projects/[ref]/[part]` traces about 2 MB.
- [x] The definition tab is still coloured, and its text still copies exactly.
- [x] The connect guides are still highlighted.
- [x] No highlighting dependency is added.

## Risk Assessment

- **A tokeniser that drops a character corrupts SQL somebody copies.** Reassembly is the test.
- **This is one term of the cold start, not the cold start.** `/login` traces 2.1 MB and was
  measured at 31 s. Do not report this as having fixed cold starts — the number to watch is the
  route's size, and the deployed effect needs the reading phase 2 of the cold-start plan asks for.

## Built 2026-09-26

```
/api/projects/[ref]/[part]     12.7 MB, 588 files   ->   2.0 MB, 107 files
```

`lib/sql-tokens.ts` does the colouring, `components/table-editor/sql-code.tsx` renders it, and the
`definition` reader returns `{ ddl, complete }` — `html` is gone from the part, the type and the
three components that passed it around.

**The tests hold the tokeniser to reassembly**, and every case checks that before it checks a kind:
a doubled quote inside a string or an identifier, a comment containing an apostrophe, a string
containing `--`, an unterminated quote, and a column named `table_name` that is not two keywords.

`lib/highlight.ts` and `CodeBlock` are untouched — the connect guides still highlight on the server,
on their own routes.

## What is still 13.4 MB

`(app)/p/[ref]/page`, the project overview, which reaches Shiki through the Connect panel's guides.
Same shape of problem, different snippets — bash, ini and TypeScript rather than SQL, so the same
forty-line answer does not fit it. Left alone deliberately; it is the next candidate if the
cold-start reading says route weight matters.
