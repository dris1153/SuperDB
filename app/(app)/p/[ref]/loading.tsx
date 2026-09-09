import { Skeleton } from "@/components/ui/skeleton";

/**
 * Mirrors the overview's two-column split so nothing jumps when the real tiles arrive. Shows once
 * p/[ref]/layout.tsx has resolved — it does not cover that layout's resolveProject fan-out, which the
 * group-level loading.tsx stands in for instead.
 */
export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-12 p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        <div className="space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-10 w-72 rounded" />
            <Skeleton className="h-5 w-56 rounded" />
          </div>

          <div className="grid gap-x-6 gap-y-7 sm:grid-cols-2">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="size-12 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2 pt-1">
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-4 w-32 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* The dotted canvas is cheap and static, so it renders for real rather than as a block. */}
        <div className="relative flex min-h-80 items-center justify-center rounded-lg border border-border bg-[radial-gradient(var(--color-subtle)_0.5px,transparent_0.5px)] [background-size:16px_16px]">
          <Skeleton className="h-40 w-full max-w-sm rounded-lg" />
        </div>
      </div>

      <Skeleton className="h-40 rounded-lg" />
    </div>
  );
}
