"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconBinaryTree2,
  IconBolt,
  IconBulb,
  IconChevronLeft,
  IconCode,
  IconDatabase,
  IconFileText,
  IconFolder,
  IconHome,
  IconLock,
  IconSettings,
  IconTable,
  IconTelescope,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * Mirrors the Supabase dashboard's project nav, minus `Integrations`: every other entry has a
 * Management API endpoint behind it and can be enabled later, but that one has none, so listing it
 * would be a permanently greyed row rather than a roadmap.
 */
const SECTIONS: { items: { slug: string; label: string; icon: typeof IconHome; ready?: boolean }[] }[] = [
  {
    items: [
      { slug: "", label: "Project Overview", icon: IconHome, ready: true },
      { slug: "tables", label: "Table Editor", icon: IconTable, ready: true },
      { slug: "sql", label: "SQL Editor", icon: IconCode, ready: true },
    ],
  },
  {
    items: [
      { slug: "database", label: "Database", icon: IconDatabase, ready: true },
      { slug: "auth", label: "Authentication", icon: IconLock },
      { slug: "storage", label: "Storage", icon: IconFolder },
      { slug: "functions", label: "Edge Functions", icon: IconBolt },
      { slug: "realtime", label: "Realtime", icon: IconBinaryTree2 },
    ],
  },
  {
    items: [
      { slug: "advisors", label: "Advisors", icon: IconBulb },
      { slug: "observability", label: "Observability", icon: IconTelescope },
      { slug: "logs", label: "Logs", icon: IconFileText },
    ],
  },
  {
    items: [{ slug: "settings", label: "Project Settings", icon: IconSettings, ready: true }],
  },
];

export function ProjectNav({ projectRef, name }: { projectRef: string; name: string }) {
  const pathname = usePathname();
  const base = `/p/${projectRef}`;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-3">
        <Link
          href="/"
          className="mb-2 flex items-center gap-1 text-xs text-subtle transition-colors hover:text-foreground"
        >
          <IconChevronLeft size={13} stroke={1.5} />
          All projects
        </Link>
        <div className="truncate text-sm text-foreground" title={name}>
          {name}
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto p-2">
        {SECTIONS.map((section, index) => (
          <div key={index} className="space-y-1">
            {section.items.map(({ slug, label, icon: Icon, ready }) => {
              const href = slug ? `${base}/${slug}` : base;
              // Prefix, not equality: settings has routes beneath it, and an exact test left
              // "Project Settings" unlit on every one of them. The other slugs have no children, so
              // this changes nothing for them.
              const active = slug ? pathname.startsWith(href) : pathname === base;

              if (!ready) {
                return (
                  <span
                    key={label}
                    aria-disabled
                    className="flex cursor-not-allowed items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-subtle/50"
                  >
                    <Icon size={16} stroke={1.5} />
                    <span className="flex-1">{label}</span>
                    <span className="text-[10px] uppercase tracking-wide text-subtle/70">soon</span>
                  </span>
                );
              }

              return (
                <Link
                  key={label}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon size={16} stroke={1.5} className={active ? "text-primary" : undefined} />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
