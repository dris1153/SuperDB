---
name: partstate-collapses-disabled-into-pending
description: useProjectPart now has a real "idle" state for disabled queries — the live trap is consumers that branch on `status === "pending"` alone and silently fall through to the error/answer branch when a part is idle
metadata:
  type: project
---

**Superseded, keep reading.** `PartState` in `components/use-project-part.ts` now has an explicit
`{ status: "idle" }` case and `useProjectPart` returns it up front when `enabled === false`, so a
disabled query no longer masquerades as in-flight. `isWaiting(state)` is the exported helper that
covers both waiting forms. Verified 2026-09-15.

**Why:** the old collapse (disabled reading as `pending` forever) was fixed after it left the table
editor's sidebar permanently dimmed. The fix moved the hazard rather than removing it.

**How to apply:** the bug class is now the *inverse* — a consumer that writes
`state.status === "pending" ? <Skeleton/> : state.status === "ready" ? ... : <answer>` sends `idle`
straight into the final else, which is usually an em dash or a failure message. Grep for
`status === "pending"` that is not `isWaiting(...)` and check whether that part is ever passed
`enabled`. `components/project-overview/usage-panel.tsx` does both in one component (line ~41 checks
`pending` alone, line ~61 checks `pending || idle`); it is harmless today only because the `logs`
part is never disabled. Related: [[part-ok-true-without-data]],
[[null-reads-as-error-not-loading]].
