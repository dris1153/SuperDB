/**
 * The original dashboard's address for the page in view, so leaving for it lands where you were.
 *
 * Targets read from `supabase/supabase` `apps/studio/pages/project/[ref]/` on 2026-09-26. Where the
 * original keys a page by something this app does not carry — a table's oid, an email template's
 * id — the link stops at the list above it. Anything unmapped opens the project's home.
 */
const BASE = "https://supabase.com/dashboard/project";

const EXACT: Record<string, string> = {
  "/auth": "auth/users",
  "/database": "database/schemas",
  "/storage": "storage/files",
  "/settings": "settings/general",
};

/** A prefix matches itself and anything below it, never a longer sibling (`/auth/oauth-server`). */
const PREFIXES: [string, string][] = [
  ["/auth/oauth", "auth/oauth-apps"],
  ["/auth/oauth-server", "auth/oauth-server"],
  ["/auth/emails", "auth/templates"],
  ["/database/schemas", "database/schemas"],
  ["/database/tables", "database/tables"],
  ["/database/functions", "database/functions"],
  ["/database/types", "database/types"],
  ["/database/policies", "database/policies"],
  ["/tables", "editor"],
  ["/sql", "sql/new"],
  ["/storage/analytics", "storage/analytics"],
  ["/storage/s3", "storage/s3"],
  ["/storage/vectors", "storage/vectors"],
  ["/settings/api-keys", "settings/api-keys"],
  ["/settings/jwt-keys", "settings/jwt"],
  ["/settings/passwords", "database/settings"],
];

export function dashboardUrl(ref: string, pathname: string): string {
  const home = `${BASE}/${ref}`;
  const prefix = `/p/${ref}`;
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return home;
  const rest = pathname.slice(prefix.length).replace(/\/+$/, "");

  const bucket = /^\/storage\/b\/([^/]+)/.exec(rest);
  if (bucket) return `${home}/storage/files/buckets/${bucket[1]}`;

  const target = EXACT[rest] ?? PREFIXES.find(([p]) => rest === p || rest.startsWith(`${p}/`))?.[1];
  return target ? `${home}/${target}` : home;
}
