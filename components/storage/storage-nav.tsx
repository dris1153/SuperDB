"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Row = { slug: string; label: string; behind: string };

/**
 * Storage's own second-level nav, in the two groups the Supabase dashboard uses.
 *
 * Every row is live, so unlike `settings-nav.tsx` there is no greyed variant here. `behind` is kept
 * as the row's `title` for a reason that outlived the greying: most of Storage is **not** on the
 * Management API, and which API each screen talks to is the least obvious thing about this feature.
 */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "Manage",
    rows: [
      { slug: "", label: "Files", behind: "GET /storage/v1/bucket" },
      { slug: "analytics", label: "Analytics", behind: "config/storage: features.icebergCatalog" },
      { slug: "vectors", label: "Vectors", behind: "config/storage: features.vectorBuckets" },
    ],
  },
  {
    title: "Configuration",
    rows: [{ slug: "s3", label: "S3", behind: "config/storage: features.s3Protocol" }],
  },
];

export function StorageNav({ projectRef }: { projectRef: string }) {
  const pathname = usePathname();
  const base = `/p/${projectRef}/storage`;

  return (
    <nav className="w-60 shrink-0 space-y-6 border-r border-border p-4">
      <div className="text-sm text-foreground">Storage</div>

      {GROUPS.map(({ title, rows }) => (
        <div key={title} className="space-y-1">
          <div className="px-2.5 pb-1 text-[11px] tracking-wider text-subtle uppercase">{title}</div>

          {rows.map(({ slug, label, behind }) => {
            const href = slug ? `${base}/${slug}` : base;
            // A bucket lives under /storage/b/..., so exact matching would unhighlight Files the
            // moment someone opened one.
            const active = slug ? pathname === href : pathname === base || pathname.startsWith(`${base}/b/`);

            return (
              <Link
                key={label}
                href={href}
                title={behind}
                className={cn(
                  "flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
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
