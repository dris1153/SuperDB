"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDatabase, IconKey, IconLayoutGrid, IconLogout } from "@tabler/icons-react";
import { cx } from "./ui";

const LINKS = [
  { href: "/", label: "Projects", icon: IconLayoutGrid },
  { href: "/accounts", label: "Accounts", icon: IconKey },
];

export function Sidebar({ email }: { email: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex h-14 items-center gap-2 border-b border-line px-4">
        <IconDatabase size={18} stroke={1.5} className="text-brand" />
        <span className="text-sm text-fg">SuperDB</span>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cx(
                "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                active ? "bg-ash text-fg" : "text-fg-muted hover:bg-ash/60 hover:text-fg",
              )}
            >
              <Icon size={16} stroke={1.5} className={active ? "text-brand" : undefined} />
              {label}
            </Link>
          );
        })}
      </nav>

      <form action="/auth/signout" method="post" className="border-t border-line p-2">
        <div className="truncate px-2.5 pb-2 pt-1 text-xs text-fg-subtle" title={email}>
          {email}
        </div>
        <button className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:bg-ash/60 hover:text-fg">
          <IconLogout size={16} stroke={1.5} />
          Sign out
        </button>
      </form>
    </aside>
  );
}
