/**
 * Everything a browser may ask about a project, by name.
 *
 * Separate from the readers in `project-parts.ts` for two reasons. It is the half that can be tested
 * — that module is `server-only` and reaches the Management API, so `pnpm test` cannot import it —
 * and the readers are declared as `Record<Part, Reader>`, which makes the compiler enforce both
 * directions: a name here with no reader fails to build, and a reader whose name is not here fails
 * too. The list and the map cannot drift apart.
 *
 * Adding a name to this list is the act of exposing a read to the browser. There is nothing else to
 * change, and nothing else that grants it.
 */
export const PART_NAMES = [
  "identity",
  "addons",
  "branches",
  "migrations",
  "backups",
  "disk",
  "pooler",
  "health",
  "overview",
  "metrics",
  "logs",
  // The table editor: one schema, one table, one page of rows.
  "schemas",
  "schema-tables",
  "columns",
  "policies",
  "rows",
  "definition",
  // The SQL editor's sidebar. Its own table in this app's database, not the project's.
  "saved-queries",
  // The API keys settings page: every key's type and prefix, and the value of the public two only.
  "api-key-rows",
  // Whether this project still issues the legacy anon and service_role JWTs. One flag, both keys.
  "legacy-api-keys",
  // The JWT Keys settings page. Signing keys carry no secret — `private_jwk` is never returned —
  // so this is a lifecycle, not a credential.
  "signing-keys",
  // Storage's limits and feature flags. Four screens read from this one response.
  "storage-config",
  // Buckets, from the project's own Storage API rather than the Management API — which can list
  // them but knows nothing else about them.
  "buckets",
  // One level of one bucket. A folder in the answer is an entry with no id, because Storage has no
  // folders — see `lib/storage-objects.ts`.
  "objects",
  // Row level security on storage.objects and storage.buckets, which is what the Policies tab is.
  "storage-policies",
  // One page of a project's users, from its own GoTrue. The Management API has no users at all.
  "auth-users",
  // One user, read again: a listed user has `identities: null` and only a single read fills them.
  "auth-user",
  // One user's auth events, from `auth_audit_logs` — the only source that carries a user id.
  "auth-user-logs",
  // The OAuth clients this project issues tokens for, and whether that server is switched on.
  "oauth-clients",
  // The Emails page: about twenty-five fields of `/config/auth`, picked out of 243.
  "auth-config",
  // The OAuth Server page: its three `/config/auth` fields, `site_url`, and the public endpoints.
  "oauth-server",
  // The Schema Visualizer: one schema's tables, columns and foreign keys, and its DDL for Copy as SQL.
  "schema-graph",
  "schema-definition",
  // Database › Tables: one schema's relations with their sizes, and one relation's columns.
  "schema-entities",
  "table-columns",
  // Edit and Duplicate table: RLS, realtime, comment, and what a copy needs — foreign keys, columns.
  "table-facts",
  // The column panel: one column's type, default, constraints and keys, and its table's primary key.
  "column-facts",
  // Database › Enumerated Types: one schema's enums and their labels.
  "enum-types",
  // Database › Functions: one schema's functions and procedures, with their bodies.
  "db-functions",
] as const;

export type Part = (typeof PART_NAMES)[number];

/** Narrows a path segment. Anything not on the list is a 404 before a token is ever decrypted. */
export const isPart = (value: string): value is Part =>
  (PART_NAMES as readonly string[]).includes(value);
