---
phase: 1
title: "Settle the reveal scope"
status: pending
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

## Success Criteria

- [ ] The result is recorded as a measurement, with the date and the token kind.
- [ ] Phase 3's copy is decided by it: either "this connection lacks a scope" or "the API does not
      currently return this to anyone".
- [ ] If 200, the reveal path is confirmed end to end rather than assumed from a status code.

## Risk Assessment

**Testing with a token that has more access than the app's own connections do.** A PAT is not what
most users connect with; `lib/oauth.ts:33` records that OAuth scopes are fixed when the app is
registered, not requested per authorization. A working PAT therefore proves the endpoint works — not
that this app's OAuth connections can reach it. Both facts belong in the note.
