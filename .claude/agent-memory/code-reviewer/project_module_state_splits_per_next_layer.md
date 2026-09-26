---
name: module-state-splits-per-next-layer
description: Next/Turbopack compiles a lib module once per layer, so any module-level Map is duplicated between route handlers (app-route) and RSC/server actions (app-rsc) — memos and invalidation silently stop crossing
metadata:
  type: project
---

A `lib/*.ts` module imported from both a route handler and an RSC page or `"use server"` action is
compiled **twice**, under two module ids:

```
[project]/lib/part-cache.ts [app-route] (ecmascript)   <- app/api/.../route.ts reaches this one
[project]/lib/part-cache.ts [app-rsc]   (ecmascript)   <- "use server" actions reach this one
```

Two module records means two `new Map()`. Anything module-level — a cache, a memo, a single-flight
map, a counter — is **per layer**, not per process. Turbopack may also inline the copy into its only
consumer and tree-shake the rest, so one side can end up with the state but none of the mutators.

**Why:** this is invisible in review (one file, one `Map`), invisible to `pnpm test` (the modules are
`server-only`, so `node:test` cannot import them), and invisible to typecheck/lint/build. It shipped
in ef6b844, where `recordWrite → dropProject` cleared an always-empty Map while the route handler
served the real one.

**How to verify (no guessing):**

```bash
# which prod chunks carry the module, and what else is in each
python -c "import json,glob; [print(p,[s for s in json.load(open(p)).get('sources',[]) if 'NAME.ts' in s]) for p in glob.glob('.next/server/**/*.map',recursive=True)]"
# the dev build names the layer outright
grep -ohE '\[project\]/lib/NAME\.ts \[[a-z-]+\]' .next/dev/server/chunks/**/*.js | sort -u
```

Two layers listed = two instances.

**Known affected, verified 2026-09-15:** `lib/part-cache.ts` (`store`), `lib/inventory.ts`
(`owners`), `lib/connections.ts` (`refreshes`).

**How to apply:** on any review that adds or relies on module-level mutable state in `lib/`, check
which layers import it before accepting the claim that it is one instance. The fix is a
`globalThis` pin, which also survives HMR:
`const store = ((globalThis as any).__x ??= new Map())`.
Related: [[csr-fanout-amplifies-resolveproject]], [[tests-cover-lib-only]].
