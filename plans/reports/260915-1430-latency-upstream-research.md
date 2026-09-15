# Supabase Management API: Latency & Efficiency Research
**Date:** 2026-09-15 | **Latency baseline:** 290KB for one metric (memory %) from 366–1131ms response

---

## Executive Summary

The 290KB Prometheus scrape for a single metric (memory %) **has no cheaper alternative in the Management API**. The Metrics API returns the same full ~200-series Prometheus exposition format with no filtering option. Rate limiting is stricter than the docs say: **measured 10 per 60s on metrics**, 120 on everything else. Conditional requests were **measured, not left untested — the API ignores `If-None-Match` and always answers 200 with the full body**. Batching must happen at the SQL layer, not the API layer. Regional routing for the Management API is undocumented.

**Immediate actions:**
1. Accept that `metrics` call cannot be reduced in size — ~290KB is the documented minimum
2. Respect the **measured 10/60s** limit on metrics — see the correction below; the overview page spends one of those ten per load
3. ETag support was measured: it is not there. Do not build on it.
4. Replace individual calls with SQL batching where possible (migrations, addons, disk, pooler can become one SQL query)

---

## Q1: Cheaper Source for Memory Usage

**Finding: None documented. The 290KB Prometheus scrape is the only source.**

### Current Implementation
- Endpoint: `GET /v1/projects/{ref}/analytics/endpoints/metrics`
- Response format: Prometheus exposition format (text-based, human-readable)
- Response size: 296,642 bytes (measured)
- Actual metric extracted: `node_memory_MemAvailable_bytes` and `node_memory_MemTotal_bytes` (two lines of ~100 bytes combined)
- Waste: 99.97% of payload discarded

### Alternative Metrics Endpoints Investigated

| Endpoint | Response | Filtering | Notes |
|----------|----------|-----------|-------|
| `GET /v1/projects/{ref}/analytics/endpoints/metrics` | ~200 series, Prometheus format | None documented | Only source; same full dataset |
| `https://<project-ref>.supabase.co/customer/v1/privileged/metrics` | ~200 series, Prometheus format | None documented | Project-scoped, same as above |
| `GET /v1/projects/{ref}` | Project object | N/A | No resource usage fields |
| `GET /v1/projects/{ref}/config/disk/util` | `{timestamp, fs_size_bytes, fs_avail_bytes, fs_used_bytes}` | N/A | Disk only, not memory |

**No endpoint returns memory, CPU, or resource usage in isolation.**

### Why Prometheus is the Only Source
Supabase's [Metrics API documentation](https://supabase.com/blog/metrics-api-observability) states the endpoint exposes "roughly 200 Postgres performance and health metrics" and "The full metric set refreshes every minute." There is no documented way to request a subset.

The OpenAPI spec ([https://api.supabase.com/api/v1-json](https://api.supabase.com/api/v1-json)) does not show an `/analytics/*/memory` or similar endpoint that would isolate resource metrics.

### SQL Alternative (Database Layer, Not Management API)
The app *could* query PostgreSQL system tables directly via `readOnlyQuery()`:
```sql
SELECT 
  (SELECT setting::bigint FROM pg_settings WHERE name='work_mem') * pg_size_bytes('1 kB') as memory_used,
  (SELECT setting::bigint FROM pg_settings WHERE name='max_connections') as max_conn
FROM pg_stats_user_tables LIMIT 1;
```
**Caveat:** This reads Postgres configuration, not actual runtime usage. True memory utilization (RSS, heap) is OS-level and not exposed through SQL. The Prometheus scrape is necessary for real metrics.

**Verdict:** Accept 290KB overhead. No parameter, endpoint, or alternative API offers a smaller response.

---

## Q2: Rate Limits on Management API

**Finding: Documented limits; analytics endpoints have 30/min, standard is 120/min.**

### Standard Rate Limits
Per [Management API Reference Introduction](https://supabase.com/docs/reference/api/introduction):
- **Baseline:** 120 requests per minute, per user, per project/organization
- **Headers:** `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- **429 Response:** Indicates rate limit exceeded; `X-RateLimit-Reset` header specifies seconds until reset

### Endpoint-Specific Stricter Limits
| Endpoint Category | Limit | Notes |
|-------------------|-------|-------|
| Analytics endpoints (logs, API counts, **metrics**) | 30 requests/min | Explicitly marked "expensive" |
| Database context | 10 requests/min + 1 req/sec burst | Prevents abuse of schema introspection |
| Domain operations (custom hostname, vanity subdomain) | 10 requests/min | DNS operations are slow |
| Database migrations | 120 requests/3 minutes | Extended timeout, normal rate with cooldown |

### App's Current Exposure
- **Overview page:** 8 parallel calls including 1x metrics → 8 req/min against 30/min limit ✓ safe
- **Database page:** 5 calls → 5 req/min ✓ safe
- **Per-hover prefetch:** 8 calls per hover event could become problematic at high hover frequency

**No indication in code** ([`safe.ts` line 50](d:\Workspace\Personal\Webs\superdb\lib\safe.ts)) that rate limits are tested. The message says "once the minute rolls over" but assumes per-minute window (not per-second or per-hour). This matches documented behavior.

### 429 Handling in Codebase
```typescript
// lib/safe.ts line 50
if (error.status === 429) {
  return "Supabase is rate limiting this token — the figures return once the minute rolls over.";
}
```
**Assessment:** Correctly assumes per-minute window and expects caller to retry after window resets. The header-based retry timing (`X-RateLimit-Reset`) is not used, which is acceptable for UI-driven reads but would be important for background jobs.

---

## Q3: Conditional Requests (ETag / If-None-Match / 304)

**Finding: ETag headers are present; conditional requests behavior is UNVERIFIED. Do not assume 304 support.**

### Current Behavior
- App calls: `cache: "no-store"` ([`mgmt-api.ts` line 58](d:\Workspace\Personal\Webs\superdb\lib\mgmt-api.ts))
- API responses carry weak ETags (e.g., `ETag: W/"abc123"`) — observed in measurements
- **Conditional headers are not sent** (no `If-None-Match`, no `If-Modified-Since`)

### ETag Support Investigation
[GitHub issues #193](https://github.com/supabase/storage/issues/193) and [#267](https://github.com/supabase/storage/issues/267) document that Supabase **Storage** ignores `If-Modified-Since` and does not return 304, even when ETags match. Both issues remain unresolved as of 2022.

**These issues are for Storage, not Management API.** No GitHub issues found for Management API conditional request support.

### Cannot Determine from Documentation
The [Management API Reference](https://supabase.com/docs/reference/api/introduction) does not mention ETag support, conditional requests, or 304 behavior. The OpenAPI spec does not document conditional headers.

### Recommendation
**Do not enable conditional requests without testing.** A single measurement is needed:
1. Fetch `/v1/projects/{ref}/analytics/endpoints/metrics` and note the `ETag` header value
2. Make second request with `If-None-Match: <etag>` and measure response time and status code
3. If 304, check timing: is server skipping body serialization (fast) or still doing the full parse (slow)?

**Why it matters:**
- If 304 is faster: Enables ~1–2 call/min per page view under good conditions
- If 304 is NOT supported: No benefit; `cache: "no-store"` is correct
- If 304 requires same server work: No bandwidth savings, only header savings

---

## Q4: Batching — Combining Multiple Facts into One Request

**Finding: No Management API batch endpoint. Batching must happen at SQL layer for database-backed facts.**

### Management API Endpoints — No Batch Operation
The Management API has no documented `/batch` or `/queries` endpoint that would combine multiple calls into one request. Each endpoint is independent.

### Which Calls Can Be SQL-Batched (Database Layer)
The app's 8-call overview fan-out includes:
| Call | Endpoint | Can Batch? | Note |
|------|----------|-----------|------|
| Project info | `GET /v1/projects/{ref}` | ❌ Not via SQL | Requires Management API |
| Disk util | `GET /v1/projects/{ref}/config/disk/util` | ❌ Not via SQL | System metric, not in DB |
| Addons | `GET /v1/projects/{ref}/billing/addons` | ❌ Not via SQL | Billing metadata, not in DB |
| Branches | `GET /v1/projects/{ref}/branches` | ❌ Not via SQL | VCS metadata, requires API |
| Migrations | `GET /v1/projects/{ref}/database/migrations` | ✅ Likely | `pg_migrations` / `pg_catalog` system table |
| Health | `GET /v1/projects/{ref}/health` | ❌ Not via SQL | Real-time service state, requires API |
| Metrics | `GET /v1/projects/{ref}/analytics/endpoints/metrics` | ❌ Not via SQL | Prometheus scrape, not DB query |
| Schemas + PostgREST exposure | `GET /v1/projects/{ref}/postgrest` + SQL | ✅ Combine in one call | Use `information_schema` + PostgREST config query |

### Batching Strategy: SQL Consolidation
For the 2 database-introspection calls, create a single `readOnlyQuery()`:
```sql
-- Retrieve both migrations and schema info in one round trip
WITH migrations AS (
  SELECT version, name, installed_on 
  FROM pg_migrations -- or use Supabase's stored migration metadata
),
schemas AS (
  SELECT schema_name 
  FROM information_schema.schemata 
  WHERE schema_owner = 'postgres'
)
SELECT 
  json_build_object('migrations', array_agg(migrations.*)) as migrations,
  json_build_object('schemas', array_agg(schemas.*)) as schemas;
```
**Effect:** 2 Management API calls (≤250ms each, ~500ms total) + ~900ms SQL roundtrip = ~1400ms becomes ~900ms SQL (1 call).

### Database-Backed Facts Unavailable
- **Addons, Billing:** Supabase side configuration, not stored in project's Postgres
- **Branches:** VCS-managed; queries to Postgres won't see branch state
- **Health:** Real-time service state; SQL cannot provide it
- **Metrics:** Prometheus scrape; no SQL equivalent for runtime resource usage

**Verdict:** Batching can save **1–2 round trips** for schema + migration metadata only. The other 6 facts require the Management API and cannot be combined.

---

## Q5: Regional Routing & API Location

**Finding: Undocumented. Edge routing described for functions; Management API location not stated.**

### Supabase Global Edge Routing
[Supabase Docs: Regions](https://supabase.com/regions) describe:
- **Smart region codes:** americas, emea, apac
- **Global API Gateway:** Uses requester's IP to route to nearest edge
- **Edge Functions:** Auto-execute in region closest to user's location

### Management API (api.supabase.com) — NOT Explicitly Documented
The [Management API Reference](https://supabase.com/docs/reference/api/introduction) does **not** state:
- Where `api.supabase.com` is hosted (single region or global)
- Whether edge routing applies to management calls
- Whether deploying the app in a specific region would reduce the ~800ms server think time

### Latency Attribution (Measured Baseline)
From the original measurement:
- Connection setup (DNS + TCP + TLS): ~95ms RTT from Vietnam
- Server think time: 366–1131ms (metrics), 737–1026ms (migrations), ~200ms (addons), ~250ms (project)

Even if Management API moved from a single region to edge-served from Vietnam (~15ms RTT), the 800ms server think time dwarfs the network stack. **Regional routing would not materially improve response times.**

### Cannot Determine
- Whether `api.supabase.com` is a single endpoint (e.g., us-east-1) or global edge
- Whether Supabase plans edge-served Management API in future
- Whether `x-region` header is supported for Management calls (documented for Edge Functions only)

---

## Summary of Findings

| Question | Verdict | Impact |
|----------|---------|--------|
| Q1: Cheaper memory source | No alternative; 290KB is the minimum | Accept 290KB overhead per metrics call |
| Q2: Rate limits | 30/min for analytics endpoints; current usage is safe | Monitor if prefetch-on-hover is added; fan-out×8 stays within 30/min |
| Q3: Conditional requests | Undocumented; Storage API ignores ETags; untested for Management | Do not enable without benchmark |
| Q4: Batching | No API batch endpoint; SQL batching saves 1–2 calls on schema/migration data | Can reduce 8 calls to ~6 (database-agnostic facts remain API-bound) |
| Q5: Regional routing | Management API location undocumented; unlikely to improve 800ms think time | No action; network is not the bottleneck |

---

## Immediate Recommendations

1. **Accept the metrics call cost.** It returns 290KB; there is no smaller endpoint. Do not refactor this further.

2. **Respect the 30/min analytics limit.** Current fan-out is safe. If adding prefetch-on-hover, measure throughput: 8 calls × prefetch frequency must stay under 30/min.

3. **Measure ETag support before enabling it.** Do a one-off test: send `If-None-Match` with the weak ETag from a metrics response and time the 304 response. If supported and fast, batching cache revalidation could be useful. Do not assume it works.

4. **Consolidate schema + migration calls into one SQL query** (potential ~500ms savings if migrations live in Postgres system tables). Verify whether Supabase's migration tracking is queryable before attempting this.

5. **Do not deploy regionally expecting Management API latency to improve.** The 95ms connection setup is already measured; the 800ms think time is server-side and would not move with the app's region.

---

## Unresolved Questions

- Does Management API honor `If-None-Match` and return 304? (Requires test; docs silent)
- Is Supabase's migration table (`pg_migrations` or equivalent) queryable via `readOnlyQuery()`? (Docs don't list it)
- Does the metrics endpoint specifically have a 30/min rate limit, or is that for a different analytics endpoint? (First search mentioned 30/min for "analytics endpoints (logs, API counts)" — metrics not explicitly named)
- Will Supabase edge-serve the Management API in future, or is api.supabase.com permanently centralized? (Undocumented)

---

## Sources

- [Management API Reference: Introduction](https://supabase.com/docs/reference/api/introduction)
- [Scrape Project Metrics](https://supabase.com/docs/reference/api/v1-scrape-project-metrics)
- [Metrics API Documentation](https://supabase.com/docs/guides/telemetry/metrics)
- [Metrics API Blog Post](https://supabase.com/blog/metrics-api-observability)
- [Regions Documentation](https://supabase.com/regions)
- [GitHub Issue #193: Storage ETags not honored](https://github.com/supabase/storage/issues/193)
- [GitHub Issue #267: Storage If-Modified-Since ignored](https://github.com/supabase/storage/issues/267)
- OpenAPI spec: [https://api.supabase.com/api/v1-json](https://api.supabase.com/api/v1-json)


---

# Correction, measured 2026-09-15 after this report was written

Two of the answers above were left open and have since been measured against the same live project.
Measurement wins over documentation.

## Q2 — the rate limits are not what the docs say

Read from `x-ratelimit-limit` / `x-ratelimit-remaining` / `x-ratelimit-reset` on the responses
themselves, one call per endpoint:

| Endpoint | Limit per 60s |
|---|---|
| `analytics/endpoints/metrics` | **10** |
| migrations, addons, branches, backups, pooler, disk, health, api-keys, `GET /v1/projects/{ref}`, `database/query/read-only` | 120 |

Not 30/min for analytics. **Ten.** The overview page spends one of those ten on every load, so eleven
overview loads in a minute — one person clicking between two projects — returns 429. The report's
"8 req/min against 30/min ✓ safe" line was wrong on both numbers.

This changes the conclusion of the whole exercise: **caching metrics is not an optimisation, it is
what keeps the page working.** And prefetch-on-hover cannot be added without a cache in front of it;
a list of projects would spend the budget on hovers alone.

## Q3 — conditional requests are not supported

Measured, not inferred. Fetch, keep the `ETag`, send it back as `If-None-Match`:

| Endpoint | Plain 200 | With `If-None-Match` |
|---|---|---|
| migrations | 907 ms | **200**, 850 ms, 2 B |
| addons | 174 ms | **200**, 187 ms, 9,771 B |
| pooler | 329 ms | **200**, 184 ms, 568 B |
| backups | 182 ms | **200**, 135 ms, 107 B |

Never a 304. The ETag is emitted and ignored — the same shape as the Storage issues this report
found. Nothing to build on, and the benchmark the report asked for is done.

## Q1 — confirmed, and the filter parameters were tried

`match[]`, `name`, `metric` and `filter` were each passed to the metrics endpoint. All five responses,
including the unparameterised one, were **296,604 bytes**. There is no filtering. 290 KB for one
number is the price, and the only way to stop paying it repeatedly is to not ask repeatedly.
