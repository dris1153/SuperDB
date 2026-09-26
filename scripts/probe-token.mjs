#!/usr/bin/env node
// Probes what a Supabase Management API token can actually reach.
// Run it once with a PAT and once with an OAuth access token, then diff the two capability tables.
//
//   SB_TOKEN=sbp_... node scripts/probe-token.mjs
//   SB_TOKEN=<oauth access_token> node scripts/probe-token.mjs

const token = process.env.SB_TOKEN;
if (!token) {
  console.error("Set SB_TOKEN to a PAT (sbp_…) or an OAuth access token.");
  process.exit(1);
}

const BASE = "https://api.supabase.com";
const results = [];

async function probe(label, path, init = {}) {
  let res;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    });
  } catch (e) {
    results.push({ label, status: "ERR", detail: String(e).slice(0, 120) });
    return null;
  }
  const text = await res.text();
  results.push({
    label,
    status: res.status,
    detail: res.ok ? "" : text.replace(/\s+/g, " ").slice(0, 140),
  });
  if (!res.ok) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const READ_ONLY_SQL = "select pg_catalog.current_database() as db;";
// current_user / session_user are reserved keywords, not schema-qualifiable functions — the usual
// "schema-qualify everything" rule for this endpoint does not apply to them.
const WHO_SQL = "select current_user::text as who, session_user::text as sess;";
// Isolates multi-statement support from whether the role switch itself is permitted.
const MULTI_SQL = "select 1 as a; select 2 as b;";
const RLS_SELF_SQL = `
select r.rolsuper, r.rolbypassrls, r.rolcanlogin
from pg_catalog.pg_roles r where r.rolname = current_user;`;
// Prefer a table that actually has RLS on — that is the case which can silently read as empty.
const FIND_RLS_TABLE_SQL = `
select n.nspname::text as schema, c.relname::text as name, c.relrowsecurity as rls
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r','p') and n.nspname = 'public'
order by c.relrowsecurity desc, c.relname
limit 1;`;
const ROLES_SQL = `
select
  r.rolname::text as role,
  pg_catalog.pg_has_role(current_user, r.oid, 'MEMBER') as can_switch
from pg_catalog.pg_roles r
where r.rolname in ('postgres','authenticated','anon','service_role','authenticator')
order by r.rolname;`;
const DEFDEF_SQL = `
select
  (select count(*) from pg_catalog.pg_constraint)::int as constraints,
  (select count(*) from pg_catalog.pg_index)::int as indexes,
  pg_catalog.pg_get_constraintdef(c.oid) as sample_constraint
from pg_catalog.pg_constraint c limit 1;`;

let whoBaseline, whoAsRole, whoAsRoleRW, defBuiltins, multiOk, roleMembership;
let roleAttrs, rlsRead, rlsVictim;

const profile = await probe("GET /v1/profile", "/v1/profile");
const orgs = await probe("GET /v1/organizations", "/v1/organizations");
const projects = await probe("GET /v1/projects", "/v1/projects");

// A paused project fails every database call for reasons unrelated to the token, which is exactly
// the confusion this probe exists to avoid. Prefer a healthy one.
const target = projects?.find((p) => p.status === "ACTIVE_HEALTHY") ?? projects?.[0];
const ref = target?.ref;
if (projects?.length) {
  console.log(`probing against ${target.name} (${target.status})\n`);
}
if (ref) {
  await probe("GET /projects/{ref}", `/v1/projects/${ref}`);
  await probe("GET health", `/v1/projects/${ref}/health?services=db,auth,rest`);
  await probe("GET config/disk/util", `/v1/projects/${ref}/config/disk/util`);
  await probe("GET api-keys", `/v1/projects/${ref}/api-keys?reveal=false`);
  await probe("GET advisors/security", `/v1/projects/${ref}/advisors/security`);
  await probe("POST query/read-only", `/v1/projects/${ref}/database/query/read-only`, {
    method: "POST",
    body: JSON.stringify({ query: READ_ONLY_SQL }),
  });
  await probe("POST query (read_only:true)", `/v1/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: READ_ONLY_SQL, read_only: true }),
  });

  // Table Editor: the role switcher needs two statements in one request — `set local role x` then
  // the select — because each request is its own transaction and a role set in a previous one is
  // gone. If multi-statement is rejected, the switcher cannot be built on this endpoint at all.
  whoBaseline = await probe("POST query/read-only (current_user)", `/v1/projects/${ref}/database/query/read-only`, {
    method: "POST",
    body: JSON.stringify({ query: WHO_SQL }),
  });
  multiOk = await probe("POST query/read-only (two selects)", `/v1/projects/${ref}/database/query/read-only`, {
    method: "POST",
    body: JSON.stringify({ query: MULTI_SQL }),
  });
  roleMembership = await probe("POST query/read-only (pg_has_role)", `/v1/projects/${ref}/database/query/read-only`, {
    method: "POST",
    body: JSON.stringify({ query: ROLES_SQL }),
  });
  whoAsRole = await probe("POST query/read-only (set local role + select)", `/v1/projects/${ref}/database/query/read-only`, {
    method: "POST",
    body: JSON.stringify({ query: `set local role authenticated; ${WHO_SQL}` }),
  });
  whoAsRoleRW = await probe("POST query (read_only:true, set local role + select)", `/v1/projects/${ref}/database/query`, {
    method: "POST",
    body: JSON.stringify({ query: `set local role authenticated; ${WHO_SQL}`, read_only: true }),
  });

  // The whole Table Editor rests on this: can the query role actually read ROWS out of a user table
  // that has RLS enabled? Catalog reads (pg_class) are unaffected by RLS, so the existing Database
  // page proves nothing here. If the role neither bypasses RLS nor is granted by a policy, every
  // protected table reads as empty and the feature is hollow.
  roleAttrs = await probe("POST query/read-only (role attrs)", `/v1/projects/${ref}/database/query/read-only`, {
    method: "POST",
    body: JSON.stringify({ query: RLS_SELF_SQL }),
  });
  const victim = (await probe("POST query/read-only (find rls table)", `/v1/projects/${ref}/database/query/read-only`, {
    method: "POST",
    body: JSON.stringify({ query: FIND_RLS_TABLE_SQL }),
  }))?.[0];
  if (victim) {
    const q = `"${victim.schema.replace(/"/g, '""')}"."${victim.name.replace(/"/g, '""')}"`;
    rlsRead = await probe(`POST query/read-only (select from ${victim.schema}.${victim.name}, rls=${victim.rls})`, `/v1/projects/${ref}/database/query/read-only`, {
      method: "POST",
      body: JSON.stringify({ query: `select count(*)::int as n from ${q};` }),
    });
    rlsVictim = victim;
  }

  // Table Editor Definition tab synthesises CREATE TABLE from the catalog; Postgres has no
  // pg_get_tabledef. Confirm the two builtins it leans on are reachable over a read-only token.
  defBuiltins = await probe("POST query/read-only (pg_get_*def)", `/v1/projects/${ref}/database/query/read-only`, {
    method: "POST",
    body: JSON.stringify({ query: DEFDEF_SQL }),
  });

  // Everything the project Overview needs. 403 names a missing scope and is fixable by
  // re-authorizing; 401 "does not support oauth access yet" is a platform gap no scope can close.
  await probe("GET api-keys?reveal=true", `/v1/projects/${ref}/api-keys?reveal=true`);
  await probe("GET analytics/metrics", `/v1/projects/${ref}/analytics/endpoints/metrics`);
  await probe("GET usage.api-counts", `/v1/projects/${ref}/analytics/endpoints/usage.api-counts?interval=1hr`);
  await probe("GET billing/addons", `/v1/projects/${ref}/billing/addons`);
  await probe("GET branches", `/v1/projects/${ref}/branches`);
  await probe("GET database/migrations", `/v1/projects/${ref}/database/migrations`);
  await probe("GET database/backups", `/v1/projects/${ref}/database/backups`);
  await probe("GET config/database/pooler", `/v1/projects/${ref}/config/database/pooler`);
}

console.log(`\ntoken prefix: ${token.slice(0, 4)}…  (${token.length} chars)\n`);
for (const r of results) {
  const mark = r.status === 200 || r.status === 201 ? "OK  " : "FAIL";
  console.log(`${mark} ${String(r.status).padEnd(4)} ${r.label}`);
  if (r.detail) console.log(`          ${r.detail}`);
}

console.log("\n--- answers to the Phase 0 questions ---");
console.log(`profile / email available : ${profile ? `yes — ${profile.primary_email}` : "NO"}`);
console.log(`organizations visible     : ${orgs ? orgs.map((o) => o.slug).join(", ") : "NO"}`);
console.log(`projects visible          : ${projects ? projects.length : "NO"}`);
if (projects?.length) {
  const bySlug = projects.reduce((acc, p) => {
    acc[p.organization_slug] = (acc[p.organization_slug] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`projects per organization : ${JSON.stringify(bySlug)}`);
}

if (projects?.length) {
  const byStatus = projects.reduce((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`project statuses          : ${JSON.stringify(byStatus)}`);
}

console.log("\n--- answers to the Table Editor questions ---");
const who = (r) => r?.[0]?.who ?? "NO";
console.log(`default query role        : ${whoBaseline ? `${who(whoBaseline)} (session ${whoBaseline[0]?.sess})` : "NO"}`);
console.log(`multi-statement accepted  : ${multiOk ? `yes — returned ${JSON.stringify(multiOk)}` : "NO"}`);
if (roleMembership) {
  const can = roleMembership.filter((r) => r.can_switch).map((r) => r.role);
  console.log(`roles this token can set  : ${can.length ? can.join(", ") : "none"}`);
  console.log(`roles seen                : ${roleMembership.map((r) => `${r.role}=${r.can_switch}`).join(" ")}`);
}
console.log(`set local role authenticated (read-only): ${whoAsRole ? `yes — became ${who(whoAsRole)}` : "NO"}`);
console.log(`set local role authenticated (query)   : ${whoAsRoleRW ? `yes — became ${who(whoAsRoleRW)}` : "NO"}`);
if (roleAttrs?.[0]) {
  const a = roleAttrs[0];
  console.log(`role attrs                : super=${a.rolsuper} bypassrls=${a.rolbypassrls} canlogin=${a.rolcanlogin}`);
}
if (rlsVictim) {
  const n = rlsRead?.[0]?.n;
  console.log(`row read (${rlsVictim.schema}.${rlsVictim.name}, rls=${rlsVictim.rls}) : ${rlsRead ? `${n} rows visible` : "BLOCKED — Table Editor cannot read this table"}`);
} else {
  console.log(`row read                  : no public table found to test against`);
}
console.log(`pg_get_*def reachable     : ${defBuiltins ? "yes" : "NO — Definition tab needs another source"}`);
