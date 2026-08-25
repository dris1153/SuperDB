"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconDatabase,
  IconLayoutGrid,
  IconLogout,
  IconPlugConnected,
  IconSettings,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

const LINKS = [
  { href: "/", label: "Projects", icon: IconLayoutGrid },
  { href: "/connections", label: "Connections", icon: IconPlugConnected },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  // Inside a project the project panel needs the horizontal space, so this drops to icons only —
  // global navigation stays reachable rather than being replaced.
  const railed = pathname.startsWith("/p/");

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-border bg-card transition-[width] duration-200",
        railed ? "w-12" : "w-56",
      )}
    >
      <div className={cn("flex h-14 items-center border-b border-border", railed ? "justify-center" : "gap-2 px-4")}>
        <IconDatabase size={18} stroke={1.5} className="text-primary" />
        {railed ? null : <span className="text-sm text-foreground">SuperDB</span>}
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const link = (
            <Link
              href={href}
              aria-label={label}
              className={cn(
                "flex items-center rounded-md py-1.5 text-sm transition-colors",
                railed ? "justify-center px-0" : "gap-2 px-2.5",
                active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon size={16} stroke={1.5} className={active ? "text-primary" : undefined} />
              {railed ? null : label}
            </Link>
          );

          if (!railed) return <div key={href}>{link}</div>;
          return (
            <Tooltip key={href}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <form action="/auth/signout" method="post" className="border-t border-border p-2">
        {railed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button aria-label="Sign out" className="flex w-full justify-center rounded-md py-1.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
                <IconLogout size={16} stroke={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Sign out — {email}</TooltipContent>
          </Tooltip>
        ) : (
          <>
            <div className="truncate px-2.5 pb-2 pt-1 text-xs text-subtle" title={email}>
              {email}
            </div>
            <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
              <IconLogout size={16} stroke={1.5} />
              Sign out
            </button>
          </>
        )}
      </form>
    </aside>
  );
}
