# Baseline

Measured 2026-09-26 against the live deployment at `https://database.drisdev.io`, from Vietnam.
Partial: every number here is browser-side. The per-stage server timings phase 1 asks for need
instrumentation in the app, which phase 1 says must not ship — see **What is still missing**.

## Where things run

```
x-vercel-id: hkg1::iad1::…
```

The edge that terminates the request is **`hkg1`** (Hong Kong); the function that renders runs in
**`iad1`** (US East, Vercel's default — there is no `vercel.json`). The Supabase project backing
SuperDB is in **`ap-southeast-2`** (Sydney), confirmed by its owner and by
`GET /v1/projects` now that the token can see it.

So a page render in `iad1` reaches its own database across the Pacific, and the browser reaches
`iad1` across it as well.

## Timings

| | |
|---|---|
| `GET /login`, cold | **31.1 s** |
| `GET /api/projects/{ref}/logs`, cold (401) | **59.2 s** |
| `GET /login`, warm | min 335 ms, median 361 ms, max 822 ms |
| `GET /` → 307 to `/login` (edge only, no function) | 134 ms |

The cold numbers are the headline and they are not a distance problem: 31 s and 59 s are an instance
starting from nothing. Warm, the same page is a third of a second.

The redirect at 134 ms is answered at the `hkg1` edge without waking a function. The gap between it
and a warm `/login` — roughly 220 ms — is the hop from Hong Kong to `iad1` plus the render.

## The two backends, from this machine

| Call | Status | min | median |
|---|---|---|---|
| `api.supabase.com/v1/projects`, no token | 401 | 106 ms | 157 ms |
| `api.supabase.com/v1/projects`, authenticated | 200 | 337 ms | 589 ms |
| `api.supabase.com/v1/projects/{ref}`, authenticated | 200 | 309 ms | 448 ms |
| `{superdb}.supabase.co/auth/v1/health` | 401 | 50 ms | 128 ms |

Both hostnames are Cloudflare (`cf-ray` ending `HKG` and `SIN`), so the unauthenticated calls are
answered near the caller and say nothing about where the work happens. The authenticated Management
API reads are the interesting pair: **200–400 ms slower than the edge-answered 401 from the same
hostname**, which is the round trip to an origin that is not in Asia.

## What that implies for phase 5 — and why it still needs the A/B

Moving functions to `syd1`:

- **Wins** the SuperDB database group. Roughly four round trips per navigation stop crossing the
  Pacific; at ~200 ms each that is the ~800 ms this plan predicted.
- **Wins** the browser hop for an APAC user: Vietnam→`iad1` ≈ 220 ms becomes Vietnam→`syd1` ≈ 110 ms.
- **May lose** the Management API group. If that origin is in the US — which the 200–400 ms gap above
  suggests — then five calls that are cheap from `iad1` each grow by a Pacific crossing.

Which is to say the measurement above does not settle it, exactly as phase 5 warned. It does
sharpen the question: the Management API group is now the *largest* remaining term either way, which
makes phase 6 (spending fewer of those calls) the better lever than phase 5 (moving closer to one
backend at the other's expense).

## What is still missing

- **Per-stage server timings.** They need `Server-Timing` headers or equivalent instrumentation in
  the app, and phase 1 requires that measurement code not ship. A preview deployment carrying it,
  torn down afterwards, is the way.
- **An authenticated navigation.** Everything above is either public or a 401; the real cost is in
  `/p/[ref]/*`, which needs a session.
- **The `syd1` preview.** Phase 5 is one line of `vercel.json` and two runs of this file.
