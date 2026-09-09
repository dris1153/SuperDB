---
type: brainstorm-report
date: 2026-09-10
scope: perceived latency / navigation speed
branch: dev
head: 5f0f14b
context: 260910-0028-whole-project-scout.md
---

# Perceived latency — why navigation feels slow, and what to do

## Problem statement

Reported: the app "feels noticeably slow"; every navigation stalls. Proposed fix was to convert
server components to client components, fetch through API routes, and show skeletons while loading.

Confirmed with the user:

- Slow in a **production build**, not just `next dev`. Not a compilation artifact.
- **All four surfaces** stall: board `/`, project `/p/[ref]`, table editor paging/sort/filter, and
  plain navigation to `/settings` or `/connections`. That breadth points at a shared path, not at any
  one page's fan-out.
- Deployed on **Vercel, default region** — no `vercel.json`, so functions run in `iad1` (US East).
- Appetite: cheapest change with the highest impact.

## Diagnosis — measured, not assumed

> **Correction, 2026-09-10, found during implementation.** Row 2 of the table below was **wrong**, and
> the error is left visible rather than edited away because this repo's docs rule is that an unchecked
> claim which gets trusted is worse than no claim.
>
> `_getAuthenticatorAssuranceLevel(jwt)` calls `getUser()` **only inside an `if (jwt)` branch**
> (`GoTrueClient.js:5013–5021`). `proxy.ts` called it with no argument, so that branch never ran; it
> fell through to line 5039, which uses `getSession()` — a cookie read. Upstream's docstring confirms
> it: *"When called without a JWT parameter, this method is fairly quick (microseconds) and rarely
> uses the network."*
>
> **The real count is 4, not 5**, and all three redundant calls are on the render side. Lever 1 below
> therefore saves nothing; Lever 2 saves everything on this path. Lever 1 was still implemented, for a
> different reason discovered in review — see
> [phase-03](../260910-0042-navigation-latency/phase-03-proxy-auth-roundtrip.md).

### `getUser()` runs 4× per navigation; 3 are redundant

| # | Site | Why it fires |
|---|---|---|
| 1 | `proxy.ts` `getUser()` | genuinely needed — revalidates the JWT |
| ~~2~~ | ~~`proxy.ts` `getAuthenticatorAssuranceLevel()`~~ | **struck: reads the cookie, makes no request** |
| 2 | `app/(app)/layout.tsx` `requireUser()` | `requireUser` carries no `cache()` |
| 3 | same layout, `getVaultMeta()` → `requireUser()` | inside `Promise.all`, so parallel — but still a second request |
| 4 | `resolveProject` → `connectionsWithTokens` → `requireUser()` | again |

`cache()` appears exactly **once** in the whole repo (`lib/inventory.ts:71`, on `resolveProject`).

### Full chain for `/p/[ref]/tables`

```
proxy      getUser()                            → Supabase Auth RTT
proxy      getAuthenticatorAssuranceLevel()     → cookie read, NO request (see correction above)
(app)      requireUser() ‖ getVaultMeta()       → 2 RTT in parallel
p/[ref]    resolveProject → connectionsWithTokens → requireUser()   → RTT
                          → select connections                     → DB RTT
                          → N × getProject()                       → Management API RTT
tables     listSchemas()                        → Management API RTT
           listTablesIn ‖ getExposedSchemas     → RTT
           rows ‖ count ‖ definition ‖ policies → RTT
```

~8–10 sequential round trips before the first HTML byte. Every page is `force-dynamic`; every
Management API call is `cache: "no-store"`. Nothing is cached anywhere.

### And nothing masks the wait

**No `loading.tsx` exists anywhere in the repo.** Three `<Suspense>` boundaries total, two of which
exist only to satisfy `useSearchParams`. So the user stares at a white screen for the entire chain.

### Region compounds it

Functions in `iad1` (US East). Every one of the auth and DB round trips above goes to the SuperDB
Supabase project, wherever that lives. If that project is in Singapore, each RTT is ~230 ms rather
than ~10–30 ms, and there are 4 of them per navigation, plus the DB selects.

**Estimated first paint: 2–4 s.** Matches the reported symptom.

## Approaches evaluated

### A. Streaming + waterfall repair, keep RSC — **chosen**

Fix the redundant round trips, then let the App Router stream skeletons.

- Pro: smallest diff; reduces *real* latency, not just perceived; no new auth surface; tokens stay
  server-side; skeletons come free from `loading.tsx`.
- Con: does not remove the per-interaction round trip in the table grid (addressed separately as
  Lever 6).

### B. Hybrid — RSC shell, client fetching for the grid only

- Pro: kills the full-page re-render on paging/sort/filter, where it hurts most.
- Con: real benefit only *after* A lands; doing it first optimizes the wrong layer.
- Verdict: keep as Lever 6, reassess after A.

### C. Full client components + API routes — the original proposal

| | Current (RSC) | Client + API routes |
|---|---|---|
| Network hops | browser → Vercel → Supabase | browser → Vercel → **own API route** → Supabase |
| Management API token | server-side, sealed | still must stay server-side → proxying is mandatory |
| Auth per endpoint | free (`requireUser` in RSC) | reimplement on every route |
| JS shipped | small | materially larger |
| Change size | ~15–40 lines per lever | rewrite most of `app/` + `components/` |
| Skeletons | `loading.tsx` gives them | hand-rolled loading state |
| **Real latency** | baseline | **worse** — one extra hop |

The token cannot reach the browser: it is AES-256-GCM sealed with `ENCRYPTION_KEY`, a server-only
env var, and the whole of `lib/crypto.ts` exists to keep it that way. So the extra hop is not
optional. C wins on *perceived* speed only — which A delivers for free.

**Rejected.**

## Recommended solution — ordered levers

Order matters, but less than first written: `proxy.ts` runs **before any rendering**, so its single
`getUser()` is a floor on how early a skeleton can appear. That floor is one round trip, not two.

### Lever 0 — Measure (≈30 min, blocks Lever 3)

Find the SuperDB Supabase project's region (Dashboard → Project Settings → General → Region), and
log per-stage timings on one production navigation. Needed to know how the ~2 s splits between auth
and Management API.

### Lever 1 — ~~Drop the redundant `getUser()` in `proxy.ts`~~ (premise wrong; saves nothing)

`getAuthenticatorAssuranceLevel()` derives exactly two values, both already available:

- `currentLevel` ← the `aal` claim in the access token; `getSession()` reads the cookie with no
  network call.
- `nextLevel` ← `'aal2'` when any factor has `status === 'verified'`; `data.user.factors` is already
  returned by the `getUser()` on the line above.

**This sentence was wrong.** It removes nothing: the call already read the cookie. The rewrite shipped anyway because it changes the factor source from the stale cookie to the authoritative `getUser()` response — a security fix, not a latency one.

⚠️ This edits a security gate. Ships only with a test asserting: user with a verified factor at
`aal1` is still redirected to `/mfa`. Identity stays established by the real `getUser()`; the
locally-read `aal` claim is Supabase-signed and only gates UI routing.

### Lever 2 — `cache()` around `requireUser` (~3 lines)

Collapses 19 call sites to one request per render. Removes 2 more RTT. `cache()` is per-request, so
the semantics are exactly what is wanted; risk near zero.

After Lever 2 alone: **4 `getUser()` calls → 2.** Lever 1 contributes nothing here.

### Lever 3 — Put compute next to the data (1 config file, conditional on Lever 0)

With N serial round trips to one backend, colocate the server with the *data*, not the user.

- Supabase project in Singapore → add `vercel.json` `{"regions": ["sin1"]}`; each RTT ~230 ms → ~10–30 ms.
- Supabase project in US East → keep `iad1`, skip this lever, weight Levers 4–5 instead.

### Lever 4 — Streaming + skeletons (the requested UX, no client conversion)

Add `loading.tsx` for `(app)/`, `p/[ref]/`, `p/[ref]/tables/`, and wrap each independent fan-out in
`<Suspense>`. The pattern already exists at `app/(app)/p/[ref]/page.tsx:181` around `ServiceUsage`;
this generalises it.

Result: shell and sidebar paint immediately, tiles stream in. **Zero fetching moves to the client,
no new API routes, tokens unmoved.**

### Lever 5 — Short-lived cache on Management API reads

Everything is `force-dynamic` + `no-store` today. `unstable_cache` at 15–30 s on `listProjects`,
`listOrgs`, `getProject` makes project-to-project navigation near-instant.

Do **not** cache: health, metrics, logs, and anything in the table editor.

### Lever 6 — The one place client-side fetching genuinely wins

Grid paging/sort/filter currently performs a full navigation plus `router.refresh()`, re-paying the
whole auth chain and re-rendering the page to move one page of rows.

Cheap form: keep the RSC page; have the grid call a server action returning **rows as JSON** and set
client state. Preserves the server-side token and the entire SQL guard layer while dropping the
full-page re-render. Defer until after 1–5 — their savings may make this unnecessary.

## Risks

| Risk | Mitigation |
|---|---|
| Lever 1 weakens the MFA gate | Regression test before merge; identity still from `getUser()` |
| `cache()` leaks a user across requests | It cannot — React `cache()` is per-request; assert in review |
| Region move puts the server far from users | Deliberate: 8 serial backend RTT outweigh one browser hop |
| Stale project status from Lever 5 | 15–30 s TTL only; exclude health/metrics/logs |
| Lever 6 duplicates read logic client-side | Server action reuses the same `selectRows`; no second SQL path |

## Success metrics

- `getUser()` calls per navigation: **5 → 2** (count in logs).
- Serial round trips before first paint: **8–10 → 4–5**.
- Time to first contentful paint on `/p/[ref]/tables`, production, cold: target **under 800 ms**
  (skeleton visible), full content under 2 s.
- No white screen on any navigation — a skeleton within ~300 ms of click.
- `pnpm test` stays green; a new test covers the MFA gate.

## Next steps

1. Lever 0 — confirm the Supabase project region; capture per-stage timings. **Blocks Lever 3.**
2. Levers 1 + 2 — remove redundant `getUser()`; ship with the MFA test.
3. Lever 4 — `loading.tsx` + Suspense boundaries.
4. Re-measure. Decide Levers 3, 5, 6 on the new numbers.

Estimated: Levers 1 + 2 + 4 ≈ half a day, under ~150 lines, covering all four reported surfaces.

## Open questions

- SuperDB Supabase project region — unknown, and it decides Lever 3.
- Whether `resolveProject`'s fan-out (asks every connection who owns a ref) is worth replacing with a
  stored ref→connection mapping. Only matters for users with many connections; measure first.
- Whether Lever 6 is still needed once 1–5 land.
