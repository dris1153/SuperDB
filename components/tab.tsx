"use client";

import { cn } from "@/lib/utils";

/**
 * The underline tab for a page with more than one view of one resource.
 *
 * Not `components/ui/tabs.tsx`, which is Radix with its own look, and not `sliding-tabs.tsx`: this
 * is the flat underline the API keys page already had, lifted out unchanged. The JWT keys and
 * Storage pages use the same one, which is the point of it being here.
 */
export function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-1 pb-2 text-sm transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-subtle hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
