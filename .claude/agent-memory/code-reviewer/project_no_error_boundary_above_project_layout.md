---
name: no-error-boundary-above-project-layout
description: app/(app)/p/[ref]/error.tsx wraps only the page; a throw in the project layout's client islands (topbar, nav) has no boundary until Next's default global error
metadata:
  type: project
---

The only error boundary in the app is `app/(app)/p/[ref]/error.tsx` (checked 2026-09-26). It catches the page, not the layout that renders it, and there is no `app/(app)/error.tsx`, `app/error.tsx` or `global-error.tsx`.

**Why:** Next puts a segment's error.tsx *inside* that segment's layout. So a render throw in `ProjectTopbar` / `ProjectNav` client islands, such as a `React.lazy` chunk that 404s after a deploy, replaces the whole app with Next's default "Application error" screen.

**How to apply:** flag any lazy/dynamic import, `use()` or throwing hook added to the project layout, topbar or sidebar. Fix with `.catch()` on the import or a local error boundary. Re-check the boundary list first, because someone may have added one since.
