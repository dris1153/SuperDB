---
name: lint-misses-unused-symbols
description: "pnpm lint + pnpm typecheck cannot detect an unused import or variable in this repo — eslint-config-next/typescript is excluded on purpose and tsconfig sets no noUnusedLocals"
metadata:
  type: project
---

`pnpm lint` and `pnpm typecheck` being green says nothing about dead symbols. Check unused imports,
unused props and unused type fields by hand on every diff.

**Why:** `eslint.config.mjs` loads only `eslint-config-next/core-web-vitals` and states that
`eslint-config-next/typescript` is *deliberately* excluded ("mostly overlaps with what `tsc --strict`
already enforces"). But `@typescript-eslint/no-unused-vars` lives in that excluded half, and
`tsconfig.json` sets neither `noUnusedLocals` nor `noUnusedParameters` — so nothing in CI looks for
them. Found in the storage feature review: `components/storage/s3-config.tsx` shipped an unused
`Button` import through a green typecheck, lint, test and build.

**How to apply:** treat "all four commands green" as evidence about behaviour, never about dead
code. When a phase deletes a control (a disabled button replaced by prose, a greyed nav row made
live), grep the file for the symbols that control used — the import and any `Row`/props field that
only the removed branch read will still be there. See [[partstate-collapses-disabled-into-pending]]
for the other class of thing a green suite hides, and [[repo-is-not-prettier-formatted]] for the
neighbouring gap in formatting.
