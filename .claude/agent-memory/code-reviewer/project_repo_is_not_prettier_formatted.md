---
name: repo-is-not-prettier-formatted
description: no prettier dep, no config, no .editorconfig — running prettier on a file makes it diverge from the repo, not converge; verified 2026-09-25 by --check across the tree
metadata:
  type: project
---

`package.json` has no `prettier` dependency and no `format` script; there is no `.prettierrc*` and
no `.editorconfig`. `eslint.config.mjs` carries no formatting rules, so `pnpm lint` is green either
way and will never catch the drift.

Measured 2026-09-25 with `npx prettier@3 --print-width 100 --check`: most tracked `.ts`/`.tsx`
files fail, including `lib/mgmt-api.ts`, `lib/project-parts.ts`, `lib/safe.ts`,
`components/project-settings/api-keys.tsx`, `components/project-settings/settings-nav.tsx`. Lines
over 100 columns are normal here — 23 of 288 tracked files exceed 200 lines and dozens carry lines
past 100.

Two places where prettier actively fights the house style:

- Tests use the compact `assert.deepEqual(xs.map((x) => x.id), ["a", "b"])` on one line
  (`lib/chart-data.test.ts`, `lib/sql-tabs.test.ts`). Prettier explodes it into a four-line call.
- Long prose JSDoc and inline comments are wrapped by hand at ~100 and prettier leaves them, so a
  file can pass `--check` while still holding 100+ column lines — passing the check proves nothing.

**Why:** the repo's formatting is hand-maintained and deliberate; introducing a formatter on a
subset of files creates churn that the next person's editor or a future repo-wide format will
re-churn, and no config records the width that was used.

**How to apply:** when a diff reformats lines the change did not touch, flag it. When new files are
reported as "prettier'd", check that (a) no unrelated file was rewritten and (b) the new files still
read like their neighbours — `--check` passing is not the goal here. Either adopt prettier repo-wide
with a committed config, or leave it out.
