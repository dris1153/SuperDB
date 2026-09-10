# Misreading branch conditions in vendor code

**Date**: 2026-09-10
**Component**: Navigation latency investigation and getAuthenticatorAssuranceLevel branch analysis
**Status**: Resolved (with caveat)

## What happened

During scouting for navigation latency, `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js` was reviewed. The conclusion was that `proxy.ts` made a second network round trip on every request via `getAuthenticatorAssuranceLevel`. The quoted evidence was the line `await this.getUser(jwt)` at the call site.

The error: that line sits inside an `if (jwt)` block beginning at line 5013. The proxy calls the method with no argument (no jwt), so the if-block never executes. Control falls through to line 5039, which calls `getSession()` — a cookie read. The vendor's docstring in `types.d.ts` (lines 1404–1408) states: "When called without a JWT parameter, this method is fairly quick (microseconds) and rarely uses the network."

The correct code was on screen. The code excerpt was not fabricated. The reading of which branch executes was wrong.

## How it spread

The false diagnosis became "getUser() fires 5x per navigation", which became the headline fix in `plans/reports/260910-0040-perceived-latency-brainstorm.md` and Phase 3 of `plans/260910-0042-navigation-latency/plan.md`, billed as the "biggest single win". Every downstream artifact repeated it faithfully. Six documents were internally consistent and collectively wrong before a single line of code was written.

## How it was caught

Code review was instructed to verify eight specific named claims rather than perform open-ended review. One claim: "does `getUser()` actually populate `user.factors`?" Tracing the branch structure revealed the premise false. The same pass found two other real defects: the `type Factor` schema declared `status?: string` where the plan specified it as required, which would let an upstream rename silently disable the MFA gate rather than break the build; and no test covers the wiring seam in `proxy.ts`, so miswiring it would pass all 262 tests.

## What happened anyway

The rewrite shipped and fixed something real that was never designed for. The old gate read factors from `session.user.factors` — the cookie — which only updates when the token refreshes. The new one reads from the `getUser()` response. Under the old gate, enrolling MFA in one browser left other browsers unchallenged for up to an hour. The new implementation closes that window. The latency fix built on a false premise landed as a genuine security fix.

## Smaller error with the same shape

Later, counting nav items with `grep -c '{ slug:'` in `components/project-nav.tsx` returned 13. The pattern also matches the `SECTIONS` type declaration at the top of the file. The real count is 12. A mechanical check was trusted without checking what it matched. Caught by listing the matches instead of counting them.

## Lessons

1. **Branch conditions matter.** Reading the right file is not reading the right branch. When quoting library internals as evidence, trace which call signature the caller actually uses and whether the code path executes given that signature.

2. **Consistency is not verification.** Six internally consistent documents were all wrong. Cross-checking conclusions against each other catches nothing if they all originate from the same false reading.

3. **Specific claims invite specific checks.** Review instructed to verify named factual claims ("does X do Y?") caught what open-ended review ("does this look right?") would likely have missed. The directive "do not take these on trust" had real effect.

4. **Corrections stay visible.** Both errors were left documented in the plan and report files rather than edited away, following this directory's rule.

5. **Static checks are silent.** The code was green under both the false premise and after correction: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and 262 unit tests.

Six commits, `35dc649..9c5db9c`, branch `perf/navigation-latency`. The actual latency win was `cache()` from `react`, wrapped around `requireUser` in `lib/supabase/server.ts`, collapsing 19 call sites to one network request per render.
