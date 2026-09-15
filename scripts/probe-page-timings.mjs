#!/usr/bin/env node
// How long the project pages wait on the Management API, per call.
//
// The pages await a fan-out and render nothing until the slowest call settles, so the number that
// matters is not the total — it is the maximum. This prints both, per page, so a change can be
// compared against it later rather than against an impression.
//
//   SB_TOKEN=sbp_... node scripts/probe-page-timings.mjs [project-ref] [runs]
//
// Every request here is a read. The two SQL statements are the ones lib/db-introspect.ts sends, and
// they go to the read-only endpoint.

const token = process.env.SB_TOKEN;
if (!token) {
  console.error("Set SB_TOKEN to a PAT (sbp_…) or an OAuth access token.");
  process.exit(1);
}

const BASE = "https://api.supabase.com";
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

async function timed(label, path, init) {
  const started = performance.now();
  const res = await fetch(BASE + path, { ...init, headers, cache: "no-store" });
  await res.text();
  return { label, ms: Math.round(performance.now() - started), status: res.status };
}

const OVERVIEW_SQL = `
select
  pg_catalog.pg_database_size(pg_catalog.current_database())::bigint as db_bytes,
  (select count(*) from pg_catalog.pg_stat_activity
    where backend_type = 'client backend')::int as connections,
  (select setting::int from pg_catalog.pg_settings where name = 'max_connections') as max_connections;`;

const TABLES_SQL = `
select n.nspname as schema, c.relname as name, c.reltuples::bigint as est_rows
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
order by pg_catalog.pg_total_relation_size(c.oid) desc
limit 200;`;

const query = (sql) => ({ method: "POST", body: JSON.stringify({ query: sql }) });

// What each page awaits before it renders anything, in the order the code lists them.
const PAGES = {
  "/p/[ref]": (ref) => [
    ["addons", `/v1/projects/${ref}/billing/addons`],
    ["branches", `/v1/projects/${ref}/branches`],
    ["migrations", `/v1/projects/${ref}/database/migrations`],
    ["backups", `/v1/projects/${ref}/database/backups`],
    ["disk", `/v1/projects/${ref}/config/disk/util`],
    ["overview (sql)", `/v1/projects/${ref}/database/query/read-only`, query(OVERVIEW_SQL)],
    ["metrics", `/v1/projects/${ref}/analytics/endpoints/metrics`],
    ["pooler", `/v1/projects/${ref}/config/database/pooler`],
  ],
  "/p/[ref]/database": (ref) => [
    ["health", `/v1/projects/${ref}/health?services=auth,db,pooler,realtime,rest,storage`],
    ["disk", `/v1/projects/${ref}/config/disk/util`],
    ["api keys", `/v1/projects/${ref}/api-keys?reveal=false`],
    ["overview (sql)", `/v1/projects/${ref}/database/query/read-only`, query(OVERVIEW_SQL)],
    ["tables (sql)", `/v1/projects/${ref}/database/query/read-only`, query(TABLES_SQL)],
  ],
};

async function pick() {
  const res = await fetch(`${BASE}/v1/projects`, { headers });
  if (!res.ok) {
    console.error(`GET /v1/projects → ${res.status}`);
    process.exit(1);
  }
  const projects = await res.json();
  return (projects.find((p) => p.status === "ACTIVE_HEALTHY") ?? projects[0])?.ref;
}

const ref = process.argv[2] ?? (await pick());
const runs = Number(process.argv[3] ?? 3);
if (!ref) {
  console.error("No project to measure.");
  process.exit(1);
}
console.log(`Measuring ${ref}, ${runs} run(s)\n`);

// resolveProject's own cost: it asks every connection for the project until one answers, so its
// floor is one GET /v1/projects/{ref} and its ceiling is one per connection.
const gate = await timed("resolveProject (one connection)", `/v1/projects/${ref}`);
console.log(`${String(gate.ms).padStart(5)}ms  ${gate.label}  [${gate.status}]\n`);

for (const [page, build] of Object.entries(PAGES)) {
  const calls = build(ref);
  const totals = [];

  for (let run = 0; run < runs; run += 1) {
    // Promise.all, exactly as the page does it: these do not depend on each other.
    const results = await Promise.all(calls.map(([label, path, init]) => timed(label, path, init)));
    const slowest = results.reduce((worst, r) => (r.ms > worst.ms ? r : worst));
    totals.push(slowest.ms);

    if (run === 0) {
      console.log(page);
      for (const r of results.sort((a, b) => b.ms - a.ms)) {
        console.log(`${String(r.ms).padStart(5)}ms  ${r.label}  [${r.status}]`);
      }
    }
  }

  const best = Math.min(...totals);
  const worst = Math.max(...totals);
  // The fan-out's cost is its slowest member, because the page awaits all of them together.
  console.log(
    `      → the page waits ${best}–${worst}ms for this fan-out, plus ${gate.ms}ms for resolveProject\n`,
  );
}
