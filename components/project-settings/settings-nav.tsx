"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Row = { slug: string; label: string; endpoint: string; ready?: boolean };

/**
 * The second-level nav inside Project Settings.
 *
 * Every greyed row names a Management API endpoint that exists — verified against the OpenAPI spec,
 * not remembered — and carries it in `title`, so the rule is checkable from the page rather than from
 * a plan file. That is the bar `project-nav.tsx` set for itself when it refused to list Integrations,
 * and a settings page is where it is easiest to break: eight aspirational links look harmless until
 * one of them can never be built.
 *
 * Integrations is absent for a subtler reason than in the main nav. `integrations/tpa` does not
 * exist, but `config/auth/third-party-auth` does — so the honest reason is that nothing in this app
 * consumes third-party auth config, not that the API is missing. Billing, Usage and Team are absent
 * because they are organization-scoped: this app reads an organization's name and models nothing
 * else about one.
 *
 * **Password Manager is its own group.** The Supabase layout this follows groups by subsystem, and
 * this one is not a subsystem: it is where a secret is kept, and where a database password can be
 * replaced. Filing it under configuration would put the most destructive page in the app in a list
 * of form fields.
 */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Configuration",
    rows: [
      { slug: "", label: "General", endpoint: "PATCH /v1/projects/{ref}", ready: true },
      {
        slug: "infrastructure",
        label: "Infrastructure",
        endpoint: "POST /v1/projects/{ref}/restart, /pause, /restore",
      },
      {
        slug: "database",
        label: "Database",
        endpoint: "GET,PUT /v1/projects/{ref}/config/database/postgres",
      },
      { slug: "api", label: "API", endpoint: "GET,PATCH /v1/projects/{ref}/postgrest" },
      { slug: "auth", label: "Authentication", endpoint: "GET,PATCH /v1/projects/{ref}/config/auth" },
      { slug: "storage", label: "Storage", endpoint: "GET,PATCH /v1/projects/{ref}/config/storage" },
      {
        slug: "domains",
        label: "Domains",
        endpoint: "POST /v1/projects/{ref}/custom-hostname/initialize",
      },
    ],
  },
  {
    title: "Security",
    rows: [
      {
        slug: "passwords",
        label: "Password Manager",
        endpoint: "PATCH /v1/projects/{ref}/database/password",
        ready: true,
      },
    ],
  },
];

export function SettingsNav({ projectRef }: { projectRef: string }) {
  const pathname = usePathname();
  const base = `/p/${projectRef}/settings`;

  return (
    <nav className="w-60 shrink-0 space-y-6 border-r border-border p-4">
      <div className="text-sm text-foreground">Settings</div>

      {GROUPS.map(({ title, rows }) =>
        // A heading with nothing under it is worse than no heading: both groups have rows today, and
        // nothing here assumes that stays true.
        rows.length === 0 ? null : (
          <div key={title} className="space-y-1">
            <div className="px-2.5 pb-1 text-[11px] tracking-wider text-subtle uppercase">{title}</div>

            {rows.map(({ slug, label, endpoint, ready }) => {
              const href = slug ? `${base}/${slug}` : base;

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
        ),
      )}
    </nav>
  );
}
