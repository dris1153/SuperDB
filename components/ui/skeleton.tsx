import { cn } from "@/lib/utils";

/**
 * No shadcn equivalent — codifies the pulsing placeholder already inlined in the connect panels and
 * the overview's ServiceUsage fallback. Border and card tint rather than a flat grey block, so a
 * loading screen keeps the same surfaces as the content replacing it.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md border border-border bg-card/50", className)} />;
}
