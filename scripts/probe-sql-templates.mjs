#!/usr/bin/env node
// Does every snippet in lib/sql-templates.ts actually work?
//
// Their whole value is being known-good, and this is the one page in the app that hands a statement
// straight to the database. Written-from-memory SQL in a reference list is worse than an empty list.
//
//   SB_TOKEN=sbp_... node scripts/probe-sql-templates.mjs [project-ref]
//
// Nothing here can modify a database: every statement goes to the *read-only* endpoint. An example
// must come back with rows, which is a real execution.
//
// A template comes back refused with SQLSTATE 25006, and that proves less than it looks. Measured
// 2026-09-13: a syntax error answers 42601 even in a read-only transaction, so 25006 does mean the
// statement parsed — but `alter table <no such table>` and a default calling a missing function
// answer 25006 as well, because the refusal is by command tag, before names are resolved.
// `create policy` is the one exception: on a missing table it answers 42P01, so substituting a real
// table verifies that template's relation for real.
//
// Placeholders are substituted regardless, so what is sent is what a reader would run.

import { SQL_EXAMPLES, SQL_TEMPLATES } from "../lib/sql-templates.ts";
import { RUNNING_QUERIES_SQL } from "../lib/running-queries.ts";

const token = process.env.SB_TOKEN;
if (!token) {
  console.error("Set SB_TOKEN to a PAT (sbp_…) or an OAuth access token.");
  process.exit(1);
}

const BASE = "https://api.supabase.com";

async function query(ref, sql) {
  const res = await fetch(`${BASE}/v1/projects/${ref}/database/query/read-only`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const sqlstate = /ERROR:\s+([0-9A-Z]{5}):/.exec(body?.message ?? "")?.[1] ?? null;
  return { status: res.status, rows: Array.isArray(body) ? body : null, sqlstate, text };
}

async function pick() {
  const res = await fetch(`${BASE}/v1/projects`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.error(`GET /v1/projects → ${res.status}\n${await res.text()}`);
    process.exit(1);
  }
  const projects = await res.json();
  return (projects.find((p) => p.status === "ACTIVE_HEALTHY") ?? projects[0])?.ref;
}

const ref = process.argv[2] ?? (await pick());
if (!ref) {
  console.error("No project to probe.");
  process.exit(1);
}
console.log(`Probing ${ref}`);

// A real table and one of its columns, so the placeholders resolve. pg_catalog is always in the
// search path, so this lookup works whatever the role's search_path says.
const target = await query(
  ref,
  `select c.relname as table, a.attname as column
     from pg_catalog.pg_class c
     join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where c.relkind = 'r' and n.nspname = 'public'
    order by c.relname, a.attnum
    limit 1`,
);
const real = target.rows?.[0];
if (!real) {
  console.error("No table in public to substitute into the templates. Cannot verify them.");
  process.exit(1);
}
console.log(`Placeholders → public.${real.table} (${real.column})\n`);

const fill = (sql) =>
  sql
    .replaceAll("parent_table", real.table)
    .replaceAll("your_table", real.table)
    .replaceAll("your_column", real.column);

let failures = 0;

for (const snippet of SQL_EXAMPLES) {
  const { status, rows, sqlstate, text } = await query(ref, snippet.sql);
  const ok = status === 201 && rows !== null;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "ok  " : "FAIL"} example ${snippet.id} → ${status}${rows ? ` (${rows.length} rows)` : ""}${
      ok ? "" : `\n     ${sqlstate ?? ""} ${text.slice(0, 300)}`
    }`,
  );
}

for (const snippet of SQL_TEMPLATES) {
  const { status, sqlstate, text } = await query(ref, fill(snippet.sql));
  // 25006 is the pass, and it means "parses, and Postgres calls this a write". Not "works".
  const ok = status === 400 && sqlstate === "25006";
  if (!ok) failures += 1;
  console.log(
    `${ok ? "ok  " : "FAIL"} template ${snippet.id} → ${status} ${sqlstate ?? "no sqlstate"} (parses, refused as a write)${
      ok ? "" : `\n     ${text.slice(0, 300)}`
    }`,
  );
}

// What the running-queries panel asks for, and what the read-only role is actually allowed to see of
// other sessions — `query` and `usename` can come back null rather than redacted.
const running = await query(ref, RUNNING_QUERIES_SQL);
console.log(
  `${running.status === 201 ? "ok  " : "FAIL"} running queries → ${running.status} (${running.rows?.length ?? 0} rows)`,
);
if (running.status !== 201) failures += 1;
if (running.rows?.length) {
  const sample = running.rows[0];
  console.log(`     columns: ${Object.keys(sample).join(", ")}`);
  console.log(`     nulls in first row: ${Object.entries(sample).filter(([, v]) => v === null).map(([k]) => k).join(", ") || "none"}`);
}

console.log(`\n${failures === 0 ? "Examples ran. Templates parse and are refused as writes." : `${failures} failed.`}`);
process.exit(failures === 0 ? 0 : 1);
