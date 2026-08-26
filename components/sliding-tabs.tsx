"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { TabsList, TabsTrigger } from "./ui/tabs";

/**
 * Radix Tabs has no Indicator primitive and shadcn's version tints each trigger instead, so a pill
 * that slides between tabs has to be measured by hand.
 *
 * Position comes from the active trigger's own box rather than from an index, which keeps it correct
 * when labels have different widths or the font loads late.
 */
export function SlidingTabsList({ className, children, ...props }: ComponentProps<typeof TabsList>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const active = list.querySelector<HTMLElement>('[data-state="active"]');
      if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };

    measure();

    // data-state flips on the triggers, not the list, hence subtree.
    const stateChanges = new MutationObserver(measure);
    stateChanges.observe(list, { subtree: true, attributes: true, attributeFilter: ["data-state"] });

    // Re-measure when the dialog resizes or a late font changes label widths.
    const resizes = new ResizeObserver(measure);
    resizes.observe(list);

    return () => {
      stateChanges.disconnect();
      resizes.disconnect();
    };
  }, []);

  return (
    <TabsList ref={listRef} className={cn("relative", className)} {...props}>
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-[3px] rounded-md bg-background transition-all duration-200 ease-out",
          pill ? "opacity-100" : "opacity-0",
        )}
        style={pill ? { left: pill.left, width: pill.width } : undefined}
      />
      {children}
    </TabsList>
  );
}

/** Defers its background to the sliding pill; without this the two would stack. */
export function SlidingTabsTrigger({ className, ...props }: ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn(
        "z-10 data-active:bg-transparent dark:data-active:border-transparent dark:data-active:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}
