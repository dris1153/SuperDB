"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Row = { slug: string; label: string; endpoint: string; ready?: boolean };

/**
 * Authentication's own second-level nav.
 *
 * Same bar as `settings-nav.tsx`: every greyed row names an endpoint that exists and carries it in
 * `title`, so the claim is checkable from the page. Most of Configuration is one endpoint —
 * `/config/auth` has 243 fields, and those pages are groups of them rather than separate APIs.
 *
 * Users and OAuth Apps are **not** on the Management API at all. They are the project's own GoTrue,
 * which refuses this app's token, so their rows name the project path instead.
 */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Manage",
    rows: [
      { slug: "", label: "Users", endpoint: "GET /auth/v1/admin/users", ready: true },
      {
        slug: "oauth",
        label: "OAuth Apps",
        endpoint: "GET /auth/v1/admin/oauth/clients",
        ready: true,
      },
    ],
  },
  {
    title: "Notifications",
    rows: [
      {
        slug: "emails",
        label: "Emails",
        endpoint: "GET,PATCH /v1/projects/{ref}/config/auth: smtp_*, mailer_*",
        ready: true,
      },
    ],
  },
  {
    title: "Configuration",
    rows: [
      { slug: "providers", label: "Sign In / Providers", endpoint: "config/auth: external_*" },
      { slug: "sessions", label: "Sessions", endpoint: "config/auth: sessions_*" },
      { slug: "rate-limits", label: "Rate Limits", endpoint: "config/auth: rate_limit_*" },
      { slug: "mfa", label: "Multi-Factor", endpoint: "config/auth: mfa_*" },
      { slug: "urls", label: "URL Configuration", endpoint: "config/auth: site_url, uri_allow_list" },
      { slug: "protection", label: "Attack Protection", endpoint: "config/auth: security_*, captcha_*" },
      { slug: "hooks", label: "Auth Hooks", endpoint: "config/auth: hook_*" },
      { slug: "advanced", label: "Advanced", endpoint: "config/auth: jwt_exp, refresh_token_*" },
      {
        slug: "sso",
        label: "Single Sign-On",
        endpoint: "GET,POST /v1/projects/{ref}/config/auth/sso/providers",
      },
      {
        slug: "third-party",
        label: "Third Party Auth",
        endpoint: "GET,POST /v1/projects/{ref}/config/auth/third-party-auth",
      },
      {
        slug: "signing-keys",
        label: "JWT Keys",
        endpoint: "Built — Project Settings › JWT Keys",
      },
    ],
  },
];

export function AuthNav({ projectRef }: { projectRef: string }) {
  const pathname = usePathname();
  const base = `/p/${projectRef}/auth`;

  return (
    <nav className="w-60 shrink-0 space-y-6 border-r border-border p-4">
      <div className="text-sm text-foreground">Authentication</div>

      {GROUPS.map(({ title, rows }) => (
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
