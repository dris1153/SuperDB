"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PartState } from "@/components/use-project-part";

/** One of the five facts across the top of the project page. */
export function Tile({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="text-[11px] tracking-wider text-subtle uppercase">{label}</div>
        <div className="mt-1 truncate text-base text-foreground">{children}</div>
      </div>
    </div>
  );
}

/**
 * What a tile shows while its part is in flight, or when it will never arrive.
 *
 * A refusal prints the reason the API gave — a missing OAuth scope is something the reader can fix,
 * and "—" would hide that there is anything to fix. The placeholder is the height of a line of text,
 * so nothing below it moves when the answer lands.
 */
export function PartValue<T>({
  state,
  children,
}: {
  state: PartState<T>;
  children: (data: T) => ReactNode;
}) {
  if (state.status === "pending" || state.status === "idle") {
    // The height of the line it replaces, so nothing moves when the answer lands.
    return <span className="block h-6 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />;
  }
  if (state.status === "refused" || state.status === "failed") {
    // A tooltip rather than a `title`: that attribute is hover-only, so the reason was unreachable
    // by keyboard and invisible on a touch screen.
    return (
      <Tooltip>
        <TooltipTrigger className="cursor-help text-sm text-subtle underline decoration-dotted underline-offset-4">
          Unavailable
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{state.reason}</TooltipContent>
      </Tooltip>
    );
  }
  return <>{children(state.data)}</>;
}
