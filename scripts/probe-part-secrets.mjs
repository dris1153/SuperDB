#!/usr/bin/env node
// What the read endpoints would hand a browser if a reader passed its upstream body through.
//
//   SB_TOKEN=sbp_... node scripts/probe-part-secrets.mjs [project-ref]
//
// `lib/project-parts.ts` claims two different things. The readers that pick fields — api-keys,
// addons, metrics, identity — are enforced by their return types, and `api-keys` is branded with
// `api_key?: never` because the upstream array carries the real service-role key even at
// `reveal=false`. The rest pass through what the app already models, and that is a claim about
// bodies nobody had read end to end.
//
// This reads them. It prints field PATHS, never values: a probe that echoes a secret to a terminal
// to prove the secret is there has published it.

const token = process.env.SB_TOKEN;
if (!token) {
  console.error("Set SB_TOKEN to a PAT (sbp_…) or an OAuth access token.");
  process.exit(1);
}

const BASE = "https://api.supabase.com";
const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// Named for the part in `project-part-names.ts` that reads them, with how the reader treats the body.
const PARTS = (ref) => [
  ["addons", `/v1/projects/${ref}/billing/addons`, "picks selected_addons"],
  ["branches", `/v1/projects/${ref}/branches`, "pass-through"],
  ["migrations", `/v1/projects/${ref}/database/migrations`, "pass-through"],
  ["backups", `/v1/projects/${ref}/database/backups`, "pass-through"],
  ["disk", `/v1/projects/${ref}/config/disk/util`, "pass-through"],
  ["pooler", `/v1/projects/${ref}/config/database/pooler`, "pass-through"],
  ["health", `/v1/projects/${ref}/health?services=auth,db,pooler,realtime,rest,storage`, "pass-through"],
  ["api-keys", `/v1/projects/${ref}/api-keys?reveal=false`, "picks id, name, prefix"],
  ["identity", `/v1/projects/${ref}`, "picks ref, name, status, region, created_at"],
];

// Shapes, not names. A field called `token` holding null is noise; a JWT sitting in a field called
// `db_dns_name` is the thing worth finding.
const SECRET = [
  [/^sbp_[a-z0-9]{20,}/i, "personal access token"],
  [/^sb_secret_/i, "secret API key"],
  [/^eyJ[A-Za-z0-9_-]{10,}\./, "JWT"],
  // Not `[YOUR-PASSWORD]`: Supabase does not return the database password through this API and puts
  // a bracketed placeholder where it goes, which is what the Get connected panel shows on purpose.
  [/^postgres(ql)?:\/\/[^:]+:(?!\[)[^@\s]+@/i, "connection string with a password"],
];

const walk = (node, path, hits) => {
  if (typeof node === "string") {
    for (const [pattern, what] of SECRET) if (pattern.test(node)) hits.push(`${path} — ${what}`);
    if (node === token) hits.push(`${path} — the request's own token, echoed back`);
    return;
  }
  if (Array.isArray(node)) {
    // Index 0 only: an array of keys repeats the same shape, and printing one path per row buries it.
    if (node.length) walk(node[0], `${path}[0]`, hits);
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key, hits);
  }
};

const ref = process.argv[2];
if (!ref) {
  console.error("Pass a project ref.");
  process.exit(1);
}

let found = 0;
for (const [part, path, treatment] of PARTS(ref)) {
  const res = await fetch(BASE + path, { headers, cache: "no-store" });
  const text = await res.text();
  if (!res.ok) {
    console.log(`${part.padEnd(12)} [${res.status}] not read`);
    continue;
  }

  const hits = [];
  try {
    walk(JSON.parse(text), "", hits);
  } catch {
    console.log(`${part.padEnd(12)} body is not JSON`);
    continue;
  }

  found += hits.length;
  console.log(`${part.padEnd(12)} ${hits.length ? `${hits.length} secret-shaped field(s)` : "clean"}  (${treatment})`);
  for (const hit of hits) console.log(`             ${hit}`);
}

console.log(
  found
    ? "\nA hit on a pass-through part is a leak. A hit on a picking reader is only a leak if the picked fields include it."
    : "\nNothing secret-shaped in any upstream body.",
);
