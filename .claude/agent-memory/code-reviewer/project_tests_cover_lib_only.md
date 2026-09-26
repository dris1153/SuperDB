---
name: tests-cover-lib-only
description: "\"pnpm test (N) green\" in a plan proves nothing about components/ — the test script globs lib/**/*.test.ts only, and there is no DOM/React test harness at all"
metadata:
  type: project
---

`pnpm test` is `node --conditions=react-server --test lib/**/*.test.ts`. There is no vitest, no
jsdom, no @testing-library — so **no file under `components/` can be tested**, including hooks,
`useSyncExternalStore` stores, and reducers living in client modules.

**Why:** plans in `plans/` routinely tick a success criterion as "`pnpm test` (N) green" next to
client-side work. The number is real and rising, and it covers none of the change under review. The
remaining criteria get marked "Needs the app" (manual), which means client state machines ship
unverified by default.

**How to apply:** never read a green test count as coverage of a client component. When client logic
has a pure core worth testing (a parse/validate function, tab-close index arithmetic, a dirty-set
computation), the actionable recommendation is to move that core into `lib/` where the existing
harness reaches it — not to ask for a new test framework. State the coverage gap explicitly in the
Metrics section so the tick in the plan is not mistaken for verification.
