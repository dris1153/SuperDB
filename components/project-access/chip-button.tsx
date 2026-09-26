"use client";

import { IconChevronDown, IconUserCircle } from "@tabler/icons-react";

/** The account a project lives in, as a button. A plain one until clicked, the popover's trigger after. */
export function ChipButton({ account, ...props }: { account: string } & React.ComponentProps<"button">) {
  return (
    <button type="button" {...props}
      className="flex min-w-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground">
      <IconUserCircle size={14} stroke={1.5} className="shrink-0" />
      <span className="truncate">{account}</span>
      <IconChevronDown size={12} stroke={1.5} className="shrink-0" />
    </button>
  );
}
