#!/usr/bin/env node
// What the query endpoints return when a statement fails.
//
// The SQL editor has to tell two failures apart: a write refused because the request went to the
// read-only endpoint, and a statement that is simply wrong. Recognising the first by SQLSTATE 25006
// is reliable; recognising it by matching English in a message is not — and it is not documented
// whether the Management API passes the SQLSTATE through at all. This prints the raw body so the
// answer is measured rather than assumed.
//
//   SB_TOKEN=sbp_... node scripts/probe-query-errors.mjs [project-ref]
//
// Nothing here can modify a database. The write probe creates a TEMPORARY table, which the read-only
// transaction should refuse outright and which would vanish with the session even if it ran.

const token = process.env.SB_TOKEN;
if (!token) {
  console.error("Set SB_TOKEN to a PAT (sbp_…) or an OAuth access token.");
  process.exit(1);
}

const BASE = "https://api.supabase.com";

async function pick() {
  const res = await fetch(`${BASE}/v1/projects`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`GET /v1/projects → ${res.status}\n${await res.text()}`);
    process.exit(1);
  }
  const projects = await res.json();
  // A paused project fails every query for an unrelated reason, which is the confusion to avoid.
  const healthy = projects.find((p) => p.status === "ACTIVE_HEALTHY") ?? projects[0];
  return healthy?.ref;
}

async function probe(label, path, query) {
  const res = await fetch(`${BASE}/v1/projects/${ref}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();

  console.log(`\n=== ${label}`);
  console.log(`query:  ${query}`);
  console.log(`status: ${res.status}`);
  console.log("body:");
  console.log(text || "(empty)");

  // Measured 2026-09-12: there is no `code` field, but the SQLSTATE is embedded in the message as
  // `ERROR:  25006: …`. An earlier version of this probe only looked for a field and reported
  // "message matching only", which was wrong and undersold what is available — the five characters
  // after `ERROR:` are Postgres's own output, not Supabase's wording, so matching them is matching a
  // code rather than matching English.
  try {
    const body = JSON.parse(text);
    if (Array.isArray(body)) {
      console.log(`\nrows: ${body.length}`);
      return;
    }
    const sqlstate = /ERROR:\s+([0-9A-Z]{5}):/.exec(body.message ?? "")?.[1] ?? null;
    console.log(`\nkeys: ${Object.keys(body).join(", ")}`);
    console.log(sqlstate ? `sqlstate in message: ${sqlstate}` : "no sqlstate anywhere");
  } catch {
    console.log("\nbody is not JSON");
  }
}

const ref = process.argv[2] ?? (await pick());
if (!ref) {
  console.error("No project to probe.");
  process.exit(1);
}
console.log(`Probing ${ref}`);

// The one that decides the run flow: does a refusal carry SQLSTATE 25006?
await probe(
  "write sent to the read-only endpoint",
  "/database/query/read-only",
  "create temporary table _superdb_readonly_probe (x int)",
);

// The editor has to render this well too, and it should look different from the above.
await probe("syntax error, read-only endpoint", "/database/query/read-only", "selec 1");

// For contrast: a statement that works, to confirm the success shape.
await probe("successful select", "/database/query/read-only", "select 1 as ok");

// Whether an unqualified reference resolves on the read-only endpoint.
//
// This decides whether the SQL editor's run flow is usable at all. Every statement goes to the
// read-only endpoint first, and `lib/mgmt-api.ts` records that this endpoint "rejects unqualified
// entity references". If that is true of a plain `select * from todos` — which is how people
// actually write SQL — then the editor reports 42P01 for a table that exists, and there is no route
// to the write endpoint because only 25006 opens it.
await probe("search_path, read-only endpoint", "/database/query/read-only", "show search_path");
await probe("search_path, write endpoint", "/database/query", "show search_path");

// pg_catalog is searched whatever search_path says, so this lookup works on either endpoint.
const listing = await fetch(`${BASE}/v1/projects/${ref}/database/query/read-only`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    query: "select tablename from pg_tables where schemaname = 'public' order by tablename limit 1",
  }),
});
const [first] = listing.ok ? await listing.json() : [];

if (!first?.tablename) {
  console.log("\n=== unqualified reference\nNo table in public to try. Skipped.");
} else {
  // Quoted, so a name needing quotes does not turn this into a syntax error and confuse the answer.
  const name = `"${first.tablename.replaceAll('"', '""')}"`;
  // count(*), not `select *`: the question is whether the name resolves, and no row of real data
  // needs to be printed to answer it.
  await probe("unqualified reference, read-only endpoint", "/database/query/read-only", `select count(*) from ${name}`);
  await probe("qualified, read-only endpoint, for contrast", "/database/query/read-only", `select count(*) from public.${name}`);
}
