---
name: signup-open-authenticated-is-untrusted
description: README says signup is open, so "behind resolveProject" only means "some stranger with their own project" — CPU/regex work in server actions is attacker-reachable
metadata:
  type: project
---

README.md (Self-hosting) states signup is open: anyone can register, connect their own Supabase
project with a PAT, and pass `resolveProject` for that ref. So a server action gated only by
`resolveProject` is callable by an untrusted user with arbitrary arguments.

Found 2026-09-27 on `addRedirectUrls`: the Supabase URL regexes ported verbatim into
`lib/auth-urls.ts` backtrack cubically on input ending in `>` (the `(?![^<]*(?:<\/\w+>|\/?>))`
lookahead after an ambiguous `.`-segment). 2048 chars = ~77 ms; 200 rows = ~15.7 s of blocked
event loop per call.

**Why:** "only the owner can call it" is not a mitigation here; the owner of *a* project is anyone.

**How to apply:** for any action taking free text, check per-call CPU bounds (regex complexity x
row count x length) before or after auth, not just ownership. Treat upstream-ported regexes as
unaudited. Related: [[mgmt-path-interpolation-is-unencoded]].
