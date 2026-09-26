"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  IconBinaryTree2,
  IconBolt,
  IconBulb,
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
import { navModeCookie, type NavMode } from "@/lib/nav-mode";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { NavModeMenu } from "./project-nav-mode";

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
      { slug: "auth", label: "Authentication", icon: IconLock, ready: true },
      { slug: "storage", label: "Storage", icon: IconFolder, ready: true },
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

/** Long enough that a mouse crossing the rail on its way somewhere else does not open it. */
const OPEN_DELAY_MS = 150;

/**
 * The project's nav, in one of three modes.
 *
 * - `expanded` — 240px in place of the rail, always open, takes real width.
 * - `collapsed` — 48px, tooltip on hover, never opens.
 * - `hover` — 48px, and hover or focus opens a panel **over** the content.
 *
 * **There is exactly one rail inside a project and this is it.** `components/sidebar.tsx` stands down
 * on these routes — it used to shrink to icons here, which would have put two icon columns side by
 * side once this one existed. The Supabase layout this copies has a single rail for the same reason:
 * its global chrome is in the topbar.
 *
 * **Tooltips live only in `collapsed`.** In `hover` the panel is about to carry the labels and in
 * `expanded` it already does; both firing at once puts a tooltip on top of a panel mid-slide.
 *
 * The mode arrives from the server, read from a cookie in the layout, so the first paint is already
 * right — `lib/nav-mode.ts` says why that is a cookie rather than `localStorage`.
 */
export function ProjectNav({ projectRef, mode: initial }: { projectRef: string; mode: NavMode }) {
  const pathname = usePathname();
  const base = `/p/${projectRef}`;

  const [mode, setMode] = useState(initial);
  const [peeking, setPeeking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const change = (next: NavMode) => {
    setMode(next);
    setPeeking(false);
    // Written straight to the cookie rather than through an action: it is a rendering preference, and
    // a round trip would make a menu click feel like a save.
    document.cookie = navModeCookie(next);
  };

  const open = mode === "expanded" || (mode === "hover" && peeking);
  const overlay = mode === "hover" && peeking;

  const peek = (next: boolean) => {
    if (mode !== "hover") return;
    if (timer.current) clearTimeout(timer.current);
    // Opening waits; closing does not. A panel that lingers after the mouse has left reads as stuck.
    if (!next) return setPeeking(false);
    timer.current = setTimeout(() => setPeeking(true), OPEN_DELAY_MS);
  };

  return (
    // The wrapper holds the rail's 48px in the layout while the panel floats over the content, so
    // opening it moves nothing. In `expanded` there is nothing to float and the width is real.
    <div
      className={cn("relative shrink-0", mode === "expanded" ? "w-60" : "w-12")}
      onMouseEnter={() => peek(true)}
      onMouseLeave={() => peek(false)}
      // Focus opens with no delay: a keyboard user has committed by the time they arrive, and this is
      // the only way `hover` mode is reachable without a mouse.
      onFocus={() => mode === "hover" && setPeeking(true)}
      onBlur={(e) => {
        if (mode === "hover" && !e.currentTarget.contains(e.relatedTarget)) setPeeking(false);
      }}
    >
      <aside
        className={cn(
          "flex flex-col border-r border-border bg-card py-2 transition-[width] duration-150 motion-reduce:transition-none",
          overlay ? "absolute inset-y-0 left-0 z-20 shadow-lg" : "h-full",
          open ? "w-60 px-2" : "w-12 items-center",
        )}
      >
        {/* The way back to the board is in the topbar, not here. `overflow-x-hidden` is needed:
            `overflow-y-auto` alone makes x `auto` too, and labels overflow while the width animates. */}
        <nav
          className={cn(
            "flex flex-col gap-1 overflow-x-hidden overflow-y-auto",
            open ? null : "items-center",
          )}
        >
          {SECTIONS.map((section, index) => (
            <div key={index} className={cn("flex flex-col gap-1", open ? null : "items-center")}>
              {index > 0 ? (
                <div className={cn("my-1 h-px bg-border", open ? "w-full" : "w-6")} />
              ) : null}

              {section.items.map(({ slug, label, icon: Icon, ready }) => {
                const href = slug ? `${base}/${slug}` : base;
                // Prefix, not equality: settings has routes beneath it, and an exact test left
                // "Project Settings" unlit on every one of them. A slug whose section has sub-routes of its own stays lit inside them.
                const active = slug ? pathname.startsWith(href) : pathname === base;

                const row = ready ? (
                  <Link
                    href={href}
                    aria-label={open ? undefined : label}
                    className={cn(
                      "flex items-center gap-2 rounded-md transition-colors",
                      open ? "h-9 px-2.5 text-sm" : "size-9 justify-center",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <Icon
                      size={16}
                      stroke={1.5}
                      className={cn("shrink-0", active ? "text-primary" : undefined)}
                    />
                    {open ? <span className="truncate">{label}</span> : null}
                  </Link>
                ) : (
                  /*
                   * `aria-disabled` on a live button, not `disabled`. While collapsed the tooltip is
                   * the only thing naming a row, and a disabled button leaves the tab order entirely
                   * — so a keyboard user would pass an unlabelled icon with no way to learn what it
                   * is. Radix also ignores pointer events on a truly disabled element, which would
                   * leave the tooltip silently never opening.
                   */
                  <button
                    type="button"
                    aria-disabled
                    onClick={(e) => e.preventDefault()}
                    aria-label={`${label} — not built yet`}
                    className={cn(
                      "flex cursor-not-allowed items-center gap-2 rounded-md text-subtle/40",
                      open ? "h-9 px-2.5 text-sm" : "size-9 justify-center",
                    )}
                  >
                    <Icon size={16} stroke={1.5} className="shrink-0" />
                    {open ? <span className="flex-1 truncate text-left">{label}</span> : null}
                    {open ? <span className="text-[10px] tracking-wide uppercase">soon</span> : null}
                  </button>
                );

                return mode === "collapsed" ? (
                  <Tooltip key={label}>
                    <TooltipTrigger asChild>{row}</TooltipTrigger>
                    <TooltipContent side="right">
                      {label}
                      {ready ? null : <span className="text-subtle"> — soon</span>}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <div key={label}>{row}</div>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={cn("mt-auto pt-2", open ? null : "flex justify-center")}>
          <NavModeMenu mode={mode} onChange={change} expanded={open} />
        </div>
      </aside>
    </div>
  );
}
