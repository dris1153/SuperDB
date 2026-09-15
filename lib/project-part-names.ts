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
  "tables",
  "api-keys",
  "metrics",
  "logs",
  // The table editor. `tables` above is the database page's inventory of the whole database; these
  // are one schema, one table, one page of rows.
  "schemas",
  "schema-tables",
  "columns",
  "policies",
  "rows",
  "definition",
  // The SQL editor's sidebar. Its own table in this app's database, not the project's.
  "saved-queries",
] as const;

export type Part = (typeof PART_NAMES)[number];

/** Narrows a path segment. Anything not on the list is a 404 before a token is ever decrypted. */
export const isPart = (value: string): value is Part =>
  (PART_NAMES as readonly string[]).includes(value);
