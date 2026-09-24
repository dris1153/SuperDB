---
phase: 1
title: "Settle the reveal scope"
status: completed
priority: P1
effort: "1h"
dependencies: []
---

# Phase 1: Settle the reveal scope

## Overview

An hour of measurement, no code. It decides what phase 3 is allowed to promise.

## The question

`reveal=true` answers 403 — *"Your account does not have the necessary privileges"* — on a healthy
project, with a personal access token, for every truthy spelling of the parameter and on both the list
and single-key endpoints.

Research names the gate: `reveal=true` requires both `api_gateway_keys_read` and
`api_gateway_keys_secret_read`. What is not known is whether the token in `.env` is a scoped PAT
missing the second, or whether [issue #50244](https://github.com/supabase/supabase/issues/50244) — the
Full-access preset omitting that scope — is still live.

Those lead to different pages. If a full-access PAT works, Reveal is a button that works for properly
scoped connections. If it does not, Reveal is a button that explains an upstream bug.

## Steps

1. Create a fresh personal access token in the Supabase dashboard with full access, or with
   `api_gateway_keys_secret_read` explicitly selected if the UI offers per-scope choice.
2. Call `GET /v1/projects/{ref}/api-keys?reveal=true` with it. Record the status and, if 200, whether
   the `secret` key's `api_key` is complete or still masked — **200 does not guarantee unmasked**.
3. Record what the token creation UI actually offered. If there was no scope choice, that is the
   answer to "can a user fix this themselves" and it belongs in the page's copy.
4. Write the result into `plans/reports/260925-0234-api-keys-measured.md`, beside the 403.

## Settled, 2026-09-25

**`reveal=true` works.** A third personal access token — scoped, preset "Full access", resource
access set to an *organization* — returns the secret key complete where `reveal=false` returns it
masked.

The earlier 403s were **reach, not a platform limit**. That token sees two projects, neither of them
the ones the first two tokens saw: this account has several organizations, and a token scoped to one
cannot touch the others. The refusals looked like a missing endpoint permission and were a token that
simply could not get to those projects.

So phase 3 builds the button for real, and its 403 path is about a connection that cannot reach or is
not permitted — a sentence the reader can act on, which is what the plan already required.

**One trap to carry forward, and it would have shipped:** a masked secret and a complete one are
**both 41 characters**. Anything deciding "is this the real key" by length is wrong in both
directions — it will treat a mask as a key and offer to copy 26 dots. The test is the mask character
`·` (U+00B7).

**Unchanged:** `service_role` comes back complete at `reveal=false` with no special permission, on
every project measured. The guard in `lib/project-parts.ts` stays.

## Success Criteria

- [x] The result is recorded as a measurement, with the date and the token kind — in
      `plans/reports/260925-0234-api-keys-measured.md`.
- [x] Phase 3's copy is decided: the button works, and a refusal is about this connection's reach or
      permissions rather than about the API.
- [x] The reveal path is confirmed by the **content** of the response, not by its status — a 200 with
      a masked key would have looked identical at the status line.

## Risk Assessment

**Testing with a token that has more access than the app's own connections do.** A PAT is not what
most users connect with; `lib/oauth.ts:33` records that OAuth scopes are fixed when the app is
registered, not requested per authorization. A working PAT therefore proves the endpoint works — not
that this app's OAuth connections can reach it. Both facts belong in the note.
