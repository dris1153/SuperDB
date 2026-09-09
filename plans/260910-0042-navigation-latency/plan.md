---
title: "Navigation latency: cut redundant round trips, then stream"
status: pending
created: 2026-09-10
blockedBy: []
blocks: []
---

# Navigation latency

Every navigation stalls 2–4 s on a white screen in production. Cause is a **serial network waterfall
before first paint**, not the cost of server components: `getUser()` fires 4× per navigation (3
redundant), ~8–10 sequential round trips precede the first HTML byte, and the repo contains **no
`loading.tsx` at all** to mask any of it.

> **Corrected 2026-09-10.** The brainstorm counted 5 `getUser()` calls, treating the proxy's
> `getAuthenticatorAssuranceLevel()` as a second network round trip. It is not: called without a JWT
> it reads the cookie. The real count is 4, all of the redundancy is on the render side, and Phase 2
> alone removes it. Phase 3 was kept for a different reason — see its file.

Diagnosis, rejected alternatives, and why client components + API routes would make real latency
*worse*: [260910-0040-perceived-latency-brainstorm.md](../reports/260910-0040-perceived-latency-brainstorm.md).
**Read it before starting.** Architecture context:
[260910-0028-whole-project-scout.md](../reports/260910-0028-whole-project-scout.md).

## Phases

| # | Phase | Status | Effort | Depends on |
|---|---|---|---|---|
| 1 | [Measure and baseline](phase-01-measure-baseline.md) | pending | ~1h | — |
| 2 | [Cache requireUser](phase-02-cache-require-user.md) | **in-progress** | ~30m | — |
| 3 | [MFA gate: authoritative factors](phase-03-proxy-auth-roundtrip.md) | **in-progress** | ~3h | 2 |
| 4 | [Streaming and skeletons](phase-04-streaming-skeletons.md) | **in-progress** | ~3h | — |
| 5 | [Region alignment](phase-05-region-alignment.md) | pending | ~30m | 1 |
| 6 | [Management API cache](phase-06-mgmt-api-cache.md) | pending | ~2h | 4 |

Phase 2 is the whole latency win on the auth path. Phase 3 turned out to be a security fix rather
than a performance one and no longer gates Phase 4 — the original "proxy before skeletons" ordering
assumed a proxy round trip that was never there. Phase 4 is now the largest remaining lever on
perceived speed. Phases 5 and 6 are independent follow-ups decided on Phase 1's numbers.

Phase 3 is `in-progress`, not complete: its blocking manual end-to-end check is unrun.

## Settled decisions

Do not re-open these during implementation:

- **Fetching stays in server components.** The Management API token is AES-256-GCM sealed with
  `ENCRYPTION_KEY`, a server-only env var — it can never reach the browser, so a client-fetch design
  must proxy through our own route and pays an extra hop. Skeletons come from `loading.tsx` instead.
- **Phase 3 extracts the gate decision into a pure function** so it can be tested. `pnpm test` globs
  `lib/**/*.test.ts` only; a root-level `proxy.test.ts` would never run.
- **Phase 3 fails closed.** No readable `aal` claim + a verified factor ⇒ redirect to `/mfa`.
- **No caching of health, metrics, logs, or anything in the table editor** (Phase 6).

## Deferred — reassess after Phase 4

**Table grid interactions.** Paging/sort/filter currently does a full navigation plus
`router.refresh()`, re-paying the whole auth chain to move one page of rows. Cheap fix would keep the
RSC page and have the grid call a server action returning rows as JSON into client state, reusing
`lib/table-rows.ts::selectRows` so no second SQL path appears. **Not scheduled**: Phases 2–4 may
reduce per-navigation cost enough that this is unnecessary. Decide with real numbers, not now.

## Cross-plan note

[260824-1218-multi-user-auth-and-oauth-connections](../260824-1218-multi-user-auth-and-oauth-connections/plan.md)
phase 3 (Hardening, `in-progress`) lists the `proxy.ts` MFA gate as a completed checklist item.
**Phase 3 here rewrites that gate.** Not a blocking relationship — hardening's remaining items (KMS,
CAPTCHA, rate-limit review) are independent — but that checklist item must be re-verified against the
new implementation before hardening is called done. Cross-reference added there.

## Success metrics

- `getUser()` calls per navigation: **4 → 2** (Phase 2). Implemented; **not yet measured** — Phase 1
  confirms it.
- Serial round trips before first paint: **8–10 → 6–8** from Phase 2; Phases 5 and 6 shorten or remove
  the rest. Phase 4 masks what remains rather than removing it — say so honestly when reporting.
- Cold production FCP on `/p/[ref]/tables`: skeleton visible **under 800 ms**, full content under 2 s.
- No white screen on any navigation.
- `pnpm test` green — 262 today (253 prior + 9 MFA gate). ✅
