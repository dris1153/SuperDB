import { Skeleton } from "@/components/ui/skeleton";

/**
 * The editor's chrome is a fixed three-part frame — sidebar, tab bar, grid — so the skeleton can
 * match it closely. Row heights track the grid's default density rather than being guessed.
 */
export default function Loading() {
  return (
    <div className="flex h-screen">
      <div className="w-64 shrink-0 space-y-3 border-r border-border p-3">
        <Skeleton className="h-8 rounded" />
        <Skeleton className="h-8 rounded" />
        <div className="space-y-1.5 pt-2">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-7 rounded" />
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-2 border-b border-border p-2">
          <Skeleton className="h-8 w-40 rounded" />
          <Skeleton className="h-8 w-40 rounded" />
        </div>

        <div className="flex gap-2 border-b border-border p-2">
          <Skeleton className="h-8 w-28 rounded" />
          <Skeleton className="h-8 w-24 rounded" />
          <Skeleton className="h-8 w-24 rounded" />
          <Skeleton className="ml-auto h-8 w-32 rounded" />
        </div>

        <div className="min-h-0 flex-1 space-y-px p-px">
          {Array.from({ length: 18 }, (_, i) => (
            <Skeleton key={i} className="h-9 rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}
