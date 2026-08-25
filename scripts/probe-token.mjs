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
