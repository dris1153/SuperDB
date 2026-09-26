import Link from "next/link";
import { IconChevronRight } from "@tabler/icons-react";
import { BrandMark } from "./brand-mark";

/**
 * The bar across the top of every project route.
 *
 * It exists because the rail has no room for a name, and it carries what the app sidebar used to:
 * that sidebar stands down inside a project now, so Connections would otherwise be reachable only by
 * going back to the board.
 *
 * Two levels, not three. Supabase's own breadcrumb has an organization and a branch between the logo
 * and the project; this app models neither — it reads an organization's name for display and has no
 * branch concept at all — so inventing the segments would be decoration that implies features.
 *
 * **Plain links rather than an account menu, and that is a measurement.** A `DropdownMenu` here put
 * Radix's menu into the first load of *every* project route: 655,239 to 707,399 bytes on
 * `/p/[ref]/settings`, 52KB to group two links and a sign-out button. Sign-out keeps its place in the
 * app sidebar, which is one click away on the board — an action taken once a session does not earn
 * 52KB on every page of it.
 *
 * No client directive for the same reason: nothing here has state, so nothing here needs to ship.
 */
export function ProjectTopbar({ projectName }: { projectName: string }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
      <Link href="/" className="flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground">
        <BrandMark size={17} />
        <span className="text-sm">Projects</span>
      </Link>

      <IconChevronRight size={14} stroke={1.5} className="text-subtle" />

      <span className="truncate text-sm text-foreground" title={projectName}>
        {projectName}
      </span>

      <nav className="ml-auto flex items-center gap-1">
        <Link
          href="/connections"
          className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          Connections
        </Link>
        <Link
          href="/settings"
          className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          Account
        </Link>
      </nav>
    </header>
  );
}
