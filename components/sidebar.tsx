"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDatabase, IconLayoutGrid, IconLogout, IconPlugConnected, IconSettings } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Projects", icon: IconLayoutGrid },
  { href: "/connections", label: "Connections", icon: IconPlugConnected },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <IconDatabase size={18} stroke={1.5} className="text-primary" />
        <span className="text-sm text-foreground">SuperDB</span>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <Icon size={16} stroke={1.5} className={active ? "text-primary" : undefined} />
              {label}
            </Link>
          );
        })}
      </nav>

      <form action="/auth/signout" method="post" className="border-t border-border p-2">
        <div className="truncate px-2.5 pb-2 pt-1 text-xs text-subtle" title={email}>
          {email}
        </div>
        <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
          <IconLogout size={16} stroke={1.5} />
          Sign out
        </button>
      </form>
    </aside>
  );
}
