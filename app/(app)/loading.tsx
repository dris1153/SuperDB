import { Skeleton } from "@/components/ui/skeleton";

/**
 * Deliberately generic. This boundary covers every page in the group — board, connections, settings —
 * and also shows while a nested layout resolves, because loading.js wraps nested layout.js files but
 * not the one in its own segment. So it stands in for /p/[ref] navigation too, and must not look like
 * any one of them.
 *
 * It cannot cover (app)/layout.tsx itself: that layout reads cookies, and without Cache Components
 * navigation blocks until it finishes. Its two round trips are the floor on how early this appears.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40 rounded" />
        <Skeleton className="h-4 w-80 rounded" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] border border-border" />
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[124px] border border-border" />
        ))}
      </div>
    </div>
  );
}
