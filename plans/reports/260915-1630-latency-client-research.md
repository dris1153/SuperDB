# Latency: Client & Server Caching Research
**2026-09-15** — Research on making fetched dashboard data appear faster in Next.js 16 + TanStack Query 5 when upstream API cannot be accelerated.

---

## Executive Summary

**Most impactful wins:**
1. **Client persistence + pre-render shell** (~800ms win) — Reshow already-fetched data instantly via IndexedDB, pair with Next.js App Shell  
2. **Server-side per-user memoization** (~200-400ms per repeat call) — Manual in-process cache keyed by user+ref, mirrors existing `inventory.ts` pattern  
3. **Prefetch on hover intent** (~800ms win if UX signals properly) — TanStack Query + Next.js Link combine to warm queries before navigation  

**Lower priority:**
- Conditional requests (ETags) — saves only body transfer (~200ms on `metrics`); server think time (~800ms) is unchanged  
- HTTP/2 or connection pooling — saves setup ~95ms per new connection, only relevant if many parallel fetches spawn multiple connections  

**Not recommended without more context:**
- Server-side `"use cache"` — requires `cacheComponents: true` flag; creates cache-poisoning risk for per-user data unless cache key carefully scoped  
- Client-side persistence across sign-out — currently unsafe; data persists and includes sensitive values  

---

## Question 1: Server-Side Per-User Caching (Next.js 16.3.2)

### What the docs actually say

Three caching models available in Next.js 16.3.2:

1. **`"use cache"` + `cacheLife` + `cacheComponents` flag** _(Next.js 16 Cache Components model)_
   - Requires `cacheComponents: true` in `next.config.ts` — **your app does NOT have this enabled**
   - Caches the return value of async functions; cache keys auto-include all arguments
   - Lifetime set via `cacheLife('hours')` or similar
   - Source: `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md` lines 14–54
   - **Per-user concern:** Arguments become part of cache key automatically; extract user ID and pass as argument to cached function (see lines 204–233 for pattern). Cache stores serialized RSC payload; never includes tokens.

2. **`unstable_cache` (legacy model, still present in 16.3.2)**
   - Available without `cacheComponents` flag, intended for non-`fetch` data sources (e.g., database queries)
   - Takes three arguments: `(async fn, keyPrefix, { tags, revalidate })`
   - Respects per-argument cache keying
   - Source: `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md` lines 27–76
   - **Per-user concern:** Second arg is key prefix only; full cache key includes arguments. Stored per-instance in-memory on serverless (ephemeral).

3. **React's `cache()` function (already in your code)**
   - Per-request deduplication only; does not persist across requests
   - Your app uses this in `lib/inventory.ts` line 108 for `resolveProject`
   - Safe for per-user data because scope is one request
   - Source: React Server Components, integrated into Next.js

4. **Manual in-process memoization with TTL** _(already in your code)_
   - Your precedent: `lib/inventory.ts` lines 105–141
   - Maintains `Map<"${userId}:${ref}", { project, at }>` keyed explicitly with user ID
   - TTL enforced by timestamp check (line 126)
   - **Deliberately never caches token** (line 99–100 comment)
   - Cost: one request per 60s per (user, ref) pair; after TTL expires, fans out to all connections again

### Cache-poisoning hazards

| Approach | Risk | Mitigation |
|----------|------|-----------|
| `"use cache"` + user arg | Cache key must include full user context; shared across instances | Extract user ID in parent, pass to cached fn as arg (see Next.js docs line 230) |
| `unstable_cache` + user arg | Same risk; ephemeral per-instance on serverless | Same; no cross-instance persistence anyway |
| Manual memo (inventory.ts style) | Cache key collision if format wrong | Explicit `${userId}:${ref}` format; immutable after creation |

**Failure mode if key is wrong:** User A's cached project metadata served to User B in the same request batch. This is production-critical.

### Recommendation for route handler

**Do not use `"use cache"` yet** — enable `cacheComponents: true` only if you adopt Partial Prefetching (requires structural changes). 

**Instead, extend the existing `inventory.ts` pattern** to the route handler:
- Wrap `readPart(part, ref, ...)` in a per-user memo: `cache(per-user-keyed-fn, 60_000)`
- Cache only the response body, never the token
- Key: `"${userId}:${ref}:${part}"` following existing convention
- Reuse existing TTL infrastructure

**Why:** 
- Matches your existing safety pattern
- No flag needed; works today  
- Low risk if key format enforced
- Cost: ~60s stale window (acceptable; upstream data is slow anyway)

---

## Question 2: Client-Side Persistence (TanStack Query v5)

### Current setup

Your app uses TanStack Query 5.102.8 with:
- `staleTime: 60_000` — data fresh for 60s  
- `gcTime: 5*60_000` — garbage-collect after 5 min of inactivity  
- `retry: 1` — one retry on transport failure  
- No persistence configured

### Persistence API in v5

**Recommended packages:**
- `@tanstack/query-async-storage-persister` — handles async storage (IndexedDB, localStorage, React Native AsyncStorage)
- `@tanstack/query-sync-storage-persister` — **not deprecated.** Checked on the registry: it publishes 5.102.8, the same version as the async persister and the app's own `@tanstack/react-query`, and carries no deprecation field. For `localStorage` it is the simpler of the two.

**Main functions:**
1. `createAsyncStoragePersister()` — wraps storage backend; accepts `storage`, `key`, `throttleTime`, `serialize`, `deserialize`
2. `persistQueryClient()` — restores cache on load and subscribes to changes automatically
3. `dehydrate()` / `hydrate()` — explicit serialization control

Source: https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient

### How it interacts with `staleTime` and `gcTime`

**staleTime:** Does NOT affect persistence. Data can be persisted while stale. staleTime only controls whether client refetches from server.

**gcTime:** **Must be ≥ `maxAge` of persister**, otherwise garbage collection discards data before persistence can restore it. Default `maxAge` for most persisters is 24 hours; if your `gcTime` is 5 min, persisted data dies after 5 min inactivity.

Action: When adding persistence, set `gcTime: 24*60*60*1000` (24h) to match typical persister `maxAge`.

Source: TanStack Query docs fetched at https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient (search result showed `maxAge` config requirement)

### Version mismatch handling

Use the `buster` option in `persistQueryClient()` config:
```typescript
persistQueryClient({
  persister,
  maxAge: 24 * 60 * 60 * 1000,
  buster: 'v1', // increment when schema changes
})
```
If stored data lacks matching buster string, it's discarded automatically.

Source: https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient (buster mentioned as version control)

### Excluding queries from persistence

**Via `dehydrate()` options (SSR/hydration):**
```typescript
dehydrate(queryClient, {
  shouldDehydrateQuery: (query) => {
    // Return false to exclude: secret keys, connection strings, tokens
    if (query.queryKey[0] === 'secretData') return false
    return query.state.status === 'success'
  }
})
```

**Via persister `serialize` / `deserialize` hooks:**
```typescript
createAsyncStoragePersister({
  storage: indexedDB,
  serialize: (data) => {
    // Remove sensitive fields before storing
    return JSON.stringify(sanitize(data))
  },
  deserialize: (data) => {
    return JSON.parse(data)
  }
})
```

Source: https://tanstack.com/query/v5/docs/react/guides/ssr (shouldDehydrateQuery example at search result fetched content)

### Security angle: What to exclude

**Exclude from persistence:**
- Connection strings (contain passwords)
- OAuth tokens or session IDs
- Private table names (if schema is secret)
- Row counts from private tables

**What's currently at risk:**
Your responses include:
```json
{
  "ok": true,
  "data": {
    "metrics": "...",  // 296KB of Prometheus text
    "migrations": [/*...*/],
    "addons": [/*...*/]
  }
}
```
IndexedDB persists all of this. Row counts and table names are moderately sensitive. Migrations schema is sensitive.

**Persistence across sign-out:** ⚠️ **Currently dangerous** — persisted data survives unless explicitly cleared. When user signs out, must call:
```typescript
queryClient.clear() // clears in-memory cache
// THEN reload persister to clear IndexedDB
```

### Recommendation

1. **Enable persistence after sign-out is fixed**
2. Exclude queries with `shouldDehydrateQuery` filter
3. Set `gcTime: 24*60*60*1000` to align with persister `maxAge`
4. Use `buster: '1'` and increment when query schema changes
5. Add explicit cache clear on sign-out
6. Use IndexedDB, not localStorage (larger, async, faster)

**Expected benefit:** Data persists across page reloads; user re-enters project, sees last-fetched data instantly (though marked stale after 60s, still visible while refetch happens).

---

## Question 3: Prefetch on Intent (Hover / `onMouseEnter`)

### TanStack Query v5 API

**`prefetchQuery()`:**
```typescript
await queryClient.prefetchQuery({
  queryKey: ['projects', ref, 'metrics'],
  queryFn: () => fetchProjectMetrics(ref),
  staleTime: 60_000 // respects your default
})
```
Respects `staleTime`; if data already cached and not stale, does nothing (network-safe).

**`ensureQueryData()`:**
```typescript
await queryClient.ensureQueryData({
  queryKey: ['projects', ref, 'metrics'],
  queryFn: () => fetchProjectMetrics(ref)
})
```
Ignores `staleTime`; returns cached data if available, regardless of staleness. Useful for critical data needed immediately.

Source: https://tanstack.com/query/v5/docs/framework/react/examples/prefetching (search results showed both methods)

### Next.js 16.3.2 Link prefetching

**Default behavior:**
- `<Link href="...">` prefetches route when it enters viewport (automatic)
- Prefetch is route-level only (Next.js router RSC payload), not TanStack Query data
- Static routes: full page prefetched  
- Dynamic routes: only shell + loading boundary prefetched (if exists)

Source: `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` lines 37–87

**Manual prefetch:**
```typescript
'use client'
import { useRouter } from 'next/navigation'

<div onMouseEnter={() => router.prefetch('/p/[ref]')}>
  <Link href="/p/projectRef">Project</Link>
</div>
```

Source: Same doc, lines 98–119

### Combining both: prefetch intent pattern

```typescript
'use client'

function ProjectCard({ projectRef }) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const handleIntent = () => {
    // Warm the Next.js route
    router.prefetch(`/p/${projectRef}`)
    
    // Warm TanStack queries for this project
    Promise.all([
      queryClient.prefetchQuery({
        queryKey: ['projects', projectRef, 'metrics'],
        queryFn: () => fetch(`/api/projects/${projectRef}/metrics`)
      }),
      // ... other parts
    ])
  }

  return (
    <div onMouseEnter={handleIntent} onTouchStart={handleIntent}>
      <Link href={`/p/${projectRef}`}>View</Link>
    </div>
  )
}
```

**Cost of implementation:**
- One server prefetch per project card hovered = potential 8 parallel requests for 30 projects
- If user hovers all cards: 30 × 8 = 240 unnecessary fetches
- Mitigation: Debounce prefetch, skip if already cached and fresh, prioritize visible cards

**Benefit:** If intent pattern works (user usually clicks after hovering), saves the full 800ms server latency by having data ready at click time.

### Recommendation

1. Start simple: `onMouseEnter` on project cards with `router.prefetch()` only (Next.js route layer)
2. Add `queryClient.prefetchQuery()` only if UX research shows users hover → click frequently
3. Implement debounce (min 500ms between prefetches) to avoid blasting API
4. Monitor: If prefetch → no-click rate > 50%, disable (wasted bandwidth)

---

## Question 4: Conditional Requests & ETags

### Current upstream behavior

| Endpoint | Size | Cache Header | ETag |
|----------|------|--------------|------|
| `metrics` | 296 KB | `no-cache` | None |
| `migrations` | ~2 bytes | — (missing) | Weak |
| `addons` | — | — (missing) | Weak |
| `GET /v1/projects/{ref}` | — | — (missing) | Weak |

Source: Your MEASURED FACTS section

### How If-None-Match + 304 works

1. First request: upstream sends response + `ETag: "abc123"`
2. Next request with `If-None-Match: "abc123"`
3. If resource unchanged: upstream returns `304 Not Modified` (no body, just headers)
4. Saves bandwidth (no 290KB body transfer)

### Wall-clock latency impact: Almost nothing

The issue: Your measurements show **server think time is 366–1131ms**, not body transfer time.

Even if a 304 saves the 154–345ms of body transfer for `metrics`:
- Still must wait for 800ms server round-trip
- Response time felt by client: ~800ms (no savings)

A 304 costs the same as a full response because:
1. DNS 1ms + TCP 45ms + TLS 48ms = 95ms (connection setup)
2. Server compute 366–1131ms (think time)
3. Server sends 304 (tiny, <1ms)

**Total: ~500ms minimum, no body-transfer savings in wall-clock time.**

Source: Standard HTTP behavior; your own measurements show think time >> body time

### Why `metrics` makes no difference

`metrics` sends `cache-control: no-cache`, which tells clients never to use cached copy without validation. But validation (If-None-Match + 304) still costs the same 800ms server round-trip.

**Could help only if:**
- You cache the response on the server itself (not client-side)
- Upstream Supabase API caches `metrics` internally and returns 304 quickly
- But your measurement shows 366–1131ms, which suggests no server-side cache exists

### Recommendation

**Do not implement conditional requests for latency.** Bandwidth optimization is not your bottleneck.

If upstream Supabase later adds server-side caching for `metrics` (returns 304 in <100ms), revisit. For now, ignore ETags.

---

## Question 5: HTTP Connection Reuse (Node.js 22 / Undici)

### Current state

Node.js 22 uses **undici** for `fetch()` by default.

**Keep-alive behavior:**
- Undici **assumes persistent connections by default** (does NOT close after each request)
- Connections are pooled and reused for subsequent requests
- Each connection has configurable `keepAliveTimeout` (default not explicitly stated in docs)

Source: https://github.com/nodejs/undici (repo states "Undici always assumes that connections are persistent and will immediately pipeline requests")

**HTTP/2 support:**
- HTTP/1.1 keep-alive works today
- HTTP/2 support is planned but NOT yet in undici
- Connection pooling is automatic

Source: https://github.com/nodejs/undici and `blog.platformatic.dev/undici-v7-is-here`

### Connection setup cost

Your measurement:
- DNS 1ms + TCP 45ms + TLS 48ms = **~95ms per new connection**
- If route handler fans out to 8 endpoints in parallel and connections aren't pooled: 8 × 95ms = 760ms (worse than server think time)

### When it matters

If your route handler does this:
```typescript
// BAD: each fetch opens new connection if pool is empty
const [metrics, migrations, addons] = await Promise.all([
  fetch(`https://api.supabase.com/metrics`),
  fetch(`https://api.supabase.com/migrations`),
  fetch(`https://api.supabase.com/addons`),
])
```

First request connects (~95ms), then second and third reuse the same connection (~5ms each).
**Net: ~105ms for the whole batch** (not 3×95ms).

### Can you tune it?

Yes, via custom Agent:
```typescript
import { Agent } from 'undici'

const agent = new Agent({
  keepAliveTimeout: 30_000, // 30s
  keepAliveMaxTimeout: 60_000, // max 60s
  connections: 1, // per origin
})

const response = await fetch(url, { dispatcher: agent })
```

But your app doesn't currently do this; Next.js uses the default dispatcher.

Source: https://undici.nodejs.org/ and search results on keep-alive configuration

### Will tuning help?

**Not significantly.** Your current bottleneck is server think time (800ms), not connection setup (95ms).

**Impact if tuned:** ~95ms saved if multiple connections currently open for the same origin. Likely not the case since all requests go to `api.supabase.com`.

### Recommendation

**Not worth doing now.** Only revisit if:
1. Fan-out to multiple origins happens in route handler
2. Profiling shows connection setup in the critical path
3. Each origin gets <1 request per second (connection pool idle timeout expires)

Current design (single origin, parallel fan-out) already benefits from keep-alive by default.

---

## Summary Table: Effort vs. Impact

| Option | Effort | Impact | Priority |
|--------|--------|--------|----------|
| Client IndexedDB persistence | Medium | 800ms on reload (if in cache) | High |
| Server per-user memo (extend inventory.ts) | Low | 200–400ms per repeat | High |
| Prefetch on hover (with debounce) | Medium | 800ms if UX works | Medium |
| ETags / 304 responses | Low | ~200ms (body only), not wall-clock | Low |
| Connection reuse tuning | Low | ~95ms if multiple origins | Low |
| Server-side `"use cache"` | High | 800ms per entry, cache-poison risk | Not recommended yet |

---

## Unresolved Questions

1. **Are 30 projects typical per account?** If fewer, prefetch on intent costs less; if more, debounce matters more.
2. **What % of users revisit the same project within 60s?** Drives ROI for per-user server memo.
3. **Does Supabase Management API support HTTP/2?** Not yet relevant, but would help if undici gains HTTP/2 support.
4. **Can you hook Supabase's caching layer?** If it caches `metrics`, a 304 could be instant. Investigate with Supabase support.

---

## References

- Next.js 16.3.2 Caching: `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`
- Next.js 16.3.2 Previous Model (unstable_cache): `node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md`
- Next.js 16.3.2 Linking & Prefetch: `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
- TanStack Query v5 Persistence: https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient
- TanStack Query v5 Prefetch: https://tanstack.com/query/v5/docs/framework/react/examples/prefetching
- TanStack Query v5 Dehydration: https://tanstack.com/query/v5/docs/react/guides/ssr
- Undici: https://github.com/nodejs/undici and https://undici.nodejs.org/
- HTTP 304: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/304
- ETag: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag
- Existing pattern (inventory.ts): `lib/inventory.ts` lines 105–141


---

# Correction, 2026-09-15

- **The sync persister is not deprecated.** `npm view @tanstack/query-sync-storage-persister` returns
  5.102.8 with no deprecation notice, as does the async persister and
  `@tanstack/react-query-persist-client`. Pick between them on storage backend, not on lifecycle.
- **Q4 and Q5 are settled by measurement, and the report's instinct on both was right.** ETags: the
  API answers 200 with the full body every time `If-None-Match` is sent — never a 304. Connections:
  DNS 1 ms, TCP 45 ms, TLS 48 ms against 800 ms of server think time.
- **Q3's rate-limit assumption was too generous.** Measured from `x-ratelimit-limit`: the metrics
  endpoint allows **10 requests per 60 seconds**, everything else 120. Prefetch-on-hover cannot be
  built without a server-side cache in front of it — see the correction in
  `260915-1430-latency-upstream-research.md`.
