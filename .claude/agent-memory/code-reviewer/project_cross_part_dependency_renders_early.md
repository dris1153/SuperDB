---
name: cross-part-dependency-renders-early
description: A component reading two project parts usually gates on one of them, so the second part's pending/refused state renders as a confident false statement
metadata:
  type: project
---

When a component calls `useProjectPart` twice, check what it renders while the **second** part is
still pending, refused or failed. The house pattern is `if (isWaiting(state)) return <Skeleton/>` on
one part only — the other is folded into a `status === "ready" ? data : []` fallback, and an empty
fallback is then rendered as a positive claim ("Create a bucket first", "no policies", a zero count).

**Why:** the two parts are independent react-query fetches of 800–1200ms upstream reads; they never
resolve together, and either can refuse permanently on its own (paused project, missing scope, a
Storage API the account token cannot reach). Seen in `components/storage/storage-policies-tab.tsx`,
which gates on `storage-policies` and derives bucket names from the `buckets` part — so a project
full of buckets is told it has none, and every policy is filed under "names no bucket this project
has", with nothing on screen saying the bucket read failed.

**How to apply:** for each part a component reads, ask what the UI asserts when that part is not
ready. If an empty derived value produces a sentence rather than a skeleton, the component needs to
wait on both parts or say which read failed. Related: [[null-reads-as-error-not-loading]],
[[partstate-collapses-disabled-into-pending]].
