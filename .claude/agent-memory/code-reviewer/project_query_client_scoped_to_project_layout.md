---
name: query-client-scoped-to-project-layout
description: QueryProvider lives in app/(app)/p/[ref]/layout.tsx, so leaving the project drops the whole React Query cache; refetchOnWindowFocus is off globally
metadata:
  type: project
---

The QueryClient is created inside `QueryProvider`, which is mounted by the `/p/[ref]` layout. Its defaults are staleTime 60s, retry 1 and refetchOnWindowFocus false. cacheComponents/Activity is off, so the layout unmounts whenever you navigate outside the project.

**Why:** freshness claims like "staleTime 0 so coming back shows new data" are true only because of the layout remount. A query whose observer stays mounted (for example in a component that is never unmounted after first use) never refetches on reopen: focus refetch is off, and staleTime alone triggers nothing. Edits made in another tab are never seen.

**How to apply:** when a component sets staleTime to force freshness, check whether its observer actually remounts on the event the comment names. If it doesn't, suggest putting the query inside the unmounting content, or calling refetch explicitly on open.
