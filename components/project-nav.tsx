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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

const ROW = "flex size-9 items-center justify-center rounded-md transition-colors";

/**
 * The project's own rail: 48px of icons, each named by a tooltip.
 *
 * **There is exactly one rail inside a project and this is it.** `components/sidebar.tsx` stands down
 * on these routes — it used to shrink to icons here, which would have put two 48px icon columns side
 * by side once this one existed, and taken every project label off the screen. The Supabase layout
 * this copies has a single rail for the same reason: its global chrome is in the topbar.
 *
 * **No collapsed state, nothing remembered.** That is what makes it work on a touch screen and under
 * a keyboard without special cases, rather than an omission. The table editor's sidebar collapses on
 * click and remembers it; the two sit on one screen under different laws, which is fine — sharing a
 * flag between them would not be.
 */
export function ProjectNav({ projectRef, name }: { projectRef: string; name: string }) {
  const pathname = usePathname();
  const base = `/p/${projectRef}`;

  return (
    <aside className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-card py-2">
      {/* The way out, and it stays here until the topbar carries it: this rail can ship before that
          does, and a project nobody can leave is worse than one without a breadcrumb. */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/"
            className={cn(ROW, "text-subtle hover:bg-muted hover:text-foreground")}
            aria-label="All projects"
          >
            <IconChevronLeft size={16} stroke={1.5} />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">All projects — {name}</TooltipContent>
      </Tooltip>

      <div className="my-1 h-px w-6 bg-border" />

      <nav className="flex flex-col items-center gap-1 overflow-y-auto">
        {SECTIONS.map((section, index) => (
          <div key={index} className="flex flex-col items-center gap-1">
            {index > 0 ? <div className="my-1 h-px w-6 bg-border" /> : null}

            {section.items.map(({ slug, label, icon: Icon, ready }) => {
              const href = slug ? `${base}/${slug}` : base;
              // Prefix, not equality: settings has routes beneath it, and an exact test left
              // "Project Settings" unlit on every one of them. The other slugs have no children, so
              // this changes nothing for them.
              const active = slug ? pathname.startsWith(href) : pathname === base;

              return (
                <Tooltip key={label}>
                  <TooltipTrigger asChild>
                    {ready ? (
                      <Link
                        href={href}
                        aria-label={label}
                        className={cn(
                          ROW,
                          active
                            ? "bg-muted text-primary"
                            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        <Icon size={16} stroke={1.5} />
                      </Link>
                    ) : (
                      /*
                       * `aria-disabled` on a live button, not `disabled`. At this width the tooltip is
                       * the only thing naming a row, and a disabled button leaves the tab order
                       * entirely — so a keyboard user would pass an unlabelled icon with no way to
                       * learn what it is. Radix also ignores pointer events on a truly disabled
                       * element, which would leave the tooltip silently never opening.
                       */
                      <button
                        type="button"
                        aria-disabled
                        onClick={(e) => e.preventDefault()}
                        aria-label={`${label} — not built yet`}
                        className={cn(ROW, "cursor-not-allowed text-subtle/40")}
                      >
                        <Icon size={16} stroke={1.5} />
                      </button>
                    )}
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {label}
                    {ready ? null : <span className="text-subtle"> — soon</span>}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
