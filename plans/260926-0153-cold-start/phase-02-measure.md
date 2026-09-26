---
phase: 2
title: "Read the platform's own cold start number"
status: blocked  # needs Vercel function logs, which are the deployment owner's to read
priority: P1
effort: "30m"
dependencies: [1]
---

# Phase 2: Read the platform's own cold start number

## Overview

Phase 1 spent an hour proving its own hypothesis wrong. The next step is not another hypothesis.

## Why this is the next step

Three things could produce a 31-second first response, and from outside they are indistinguishable:

1. **Platform boot** — fetching and unpacking the function, starting the runtime.
2. **Module evaluation** — the app's own imports running for the first time.
3. **The handler** — the work the request actually asks for, cold.

Phase 1 ruled out (2) for the one dependency big enough to notice, and found that route size does
not track cold start: the smallest page in the app was 31 s while a route five times its size was
59 s. That pattern points at (1) or at something request-shaped, and Vercel measures both.

## What to read

In the Vercel dashboard, for the deployment serving `database.drisdev.io`:

- **Function logs** for a cold invocation of `/login` and of `/api/projects/[ref]/[part]`. Each line
  carries an init duration and a total duration.
- **Whether the deployment is one function or many.** If routes are merged into a single function,
  every route pays the largest route's bundle, and phase 1's 13 MB becomes relevant again — for
  `/login` too. If they are separate, the 13 MB explains only the two routes that carry it.
- **The plan and its concurrency model.** Fluid compute, if it is off, changes how often a cold boot
  happens at all.

## What each answer would mean

| Reading | What follows |
|---|---|
| Init duration is most of the 31 s | Platform boot. Bundle size is the lever, and phase 1's 10.4 MB of Shiki becomes worth removing properly — by not reaching it from those two routes at all, rather than by moving an import. |
| Init is small, total is large | The handler. That is this app's own code, and it is measurable with `Server-Timing` on a preview. |
| One function serves everything | The 13 MB is everyone's problem, not two routes' problem. |

## Success Criteria

- [ ] An init duration and a total duration recorded for one cold `/login`.
- [ ] The same for one cold part request.
- [ ] Whether the deployment is one function or several.

## Risk Assessment

- **The temptation is to skip this and start optimising.** Phase 1 is what that looks like: an hour
  spent on a plausible cause that the evidence had already half-refuted.
