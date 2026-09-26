"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Row = { slug: string; label: string; endpoint: string; ready?: boolean };

/**
 * Database's own second-level nav, the original's groups in the original's order.
 *
 * Same bar as `auth-nav.tsx`: a greyed row names what it would call, in `title`. Most of Database
 * Management is the catalog read through the SQL endpoint rather than an endpoint of its own.
 */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Database Management",
    rows: [
      { slug: "schemas", label: "Schema Visualizer", endpoint: "SQL: pg_class, pg_attribute, pg_constraint", ready: true },
      { slug: "tables", label: "Tables", endpoint: "SQL: pg_class", ready: true },
      { slug: "functions", label: "Functions", endpoint: "SQL: pg_proc" },
      { slug: "triggers", label: "Triggers", endpoint: "SQL: pg_trigger" },
      { slug: "types", label: "Enumerated Types", endpoint: "SQL: pg_enum" },
      { slug: "extensions", label: "Extensions", endpoint: "SQL: pg_available_extensions" },
      { slug: "indexes", label: "Indexes", endpoint: "SQL: pg_index" },
      { slug: "publications", label: "Publications", endpoint: "SQL: pg_publication" },
    ],
  },
  {
    title: "Access Control",
    rows: [
      { slug: "policies", label: "Policies", endpoint: "SQL: pg_policy" },
      { slug: "roles", label: "Roles", endpoint: "SQL: pg_roles" },
    ],
  },
  {
    title: "Configuration",
    rows: [{ slug: "settings", label: "Settings", endpoint: "GET,PUT /v1/projects/{ref}/config/database/postgres" }],
  },
  {
    title: "Platform",
    rows: [
      { slug: "backups", label: "Backups", endpoint: "GET /v1/projects/{ref}/database/backups" },
      { slug: "migrations", label: "Migrations", endpoint: "GET /v1/projects/{ref}/database/migrations" },
    ],
  },
];

export function DatabaseNav({ projectRef }: { projectRef: string }) {
  const pathname = usePathname();
  const base = `/p/${projectRef}/database`;

  return (
    <nav className="w-60 shrink-0 space-y-6 overflow-y-auto border-r border-border p-4">
      <div className="text-sm text-foreground">Database</div>

      {GROUPS.map(({ title, rows }) => (
        <div key={title} className="space-y-1">
          <div className="px-2.5 pb-1 text-[11px] tracking-wider text-subtle uppercase">{title}</div>

          {rows.map(({ slug, label, endpoint, ready }) => {
            const href = `${base}/${slug}`;

            if (!ready) {
              return (
                <span
                  key={label}
                  aria-disabled
                  title={endpoint}
                  className="flex cursor-not-allowed items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-subtle/50"
                >
                  <span className="flex-1">{label}</span>
                  <span className="text-[10px] tracking-wide text-subtle/70 uppercase">soon</span>
                </span>
              );
            }

            return (
              <Link
                key={label}
                href={href}
                title={endpoint}
                className={cn(
                  "flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  pathname === href
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
