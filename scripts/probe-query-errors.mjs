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

  // Whatever the shape, say plainly whether a machine-readable code survived into it.
  try {
    const body = JSON.parse(text);
    const code = body.code ?? body.sqlstate ?? body.error?.code ?? null;
    console.log(`\nkeys: ${Object.keys(body).join(", ")}`);
    console.log(code ? `code found: ${code}` : "no code/sqlstate field — message matching only");
  } catch {
    console.log("\nbody is not JSON — message matching only");
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
