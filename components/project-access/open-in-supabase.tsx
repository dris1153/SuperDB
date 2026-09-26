"use client";

import { usePathname } from "next/navigation";
import { IconExternalLink } from "@tabler/icons-react";
import { dashboardUrl } from "@/lib/dashboard-url";

/** One click to the same page in the original dashboard. */
export function OpenInSupabase({ projectRef }: { projectRef: string }) {
  const pathname = usePathname();
  return (
    <a href={dashboardUrl(projectRef, pathname)} target="_blank" rel="noreferrer"
      className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
      Open in Supabase <IconExternalLink size={14} stroke={1.5} />
    </a>
  );
}
