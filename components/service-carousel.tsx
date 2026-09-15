"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { count as compact } from "@/lib/format";
import type { ServiceCard } from "@/lib/logs-sql";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

// Charts are recharts now, and recharts is large. Loaded on demand so it stays out of the project
// page's first load; the placeholder is the same height, so nothing moves when it arrives.
const StackedBars = dynamic(() => import("./stacked-bars").then((m) => m.StackedBars), {
  ssr: false,
  loading: () => <Skeleton className="h-24 w-full" />,
});

/**
 * What the row looks like before the metrics land.
 *
 * Next to `ServiceTile` on purpose: a placeholder that lives in another file is a second copy of
 * this layout, and the copy is the one that goes stale. Three cards rather than six — the row
 * scrolls, so the rest are off-screen anyway.
 */
export function ServiceCarouselSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden">
      {[0, 1, 2].map((card) => (
        <Card key={card} className="w-72 shrink-0 gap-0 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
            <div className="flex shrink-0 gap-4">
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-8 w-14" />
            </div>
          </div>
          <Skeleton className="mt-4 h-24 w-full" />
          <div className="mt-1 flex justify-between">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** How far the row may reach past its container on each side. */
const MAX_BLEED = 320;

const time = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

function ServiceTile({ card, from, to }: { card: ServiceCard; from: number; to: number }) {
  const idle = card.total === 0;

  return (
    <Card className={`w-72 shrink-0 gap-0 p-4 ${idle ? "opacity-40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] tracking-wide text-subtle uppercase">
            {card.label}
          </div>
          <div className="mt-1 text-2xl tabular-nums text-foreground">{compact(card.total)}</div>
        </div>

        <div className="flex shrink-0 gap-4 text-right">
          <div>
            <div className="flex items-center gap-1 text-[10px] tracking-wide text-subtle uppercase">
              <span className="size-1.5 rounded-full bg-warn" />
              Warnings
            </div>
            <div className="mt-1 text-sm tabular-nums text-foreground">{card.warn}</div>
          </div>
          <div>
            <div className="flex items-center gap-1 text-[10px] tracking-wide text-subtle uppercase">
              <span className="size-1.5 rounded-full bg-destructive" />
              Errors
            </div>
            <div className="mt-1 text-sm tabular-nums text-foreground">{card.err}</div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <StackedBars buckets={card.buckets} label={card.label} />
      </div>

      <div className="mt-1 flex justify-between font-mono text-[10px] text-subtle">
        <span>{time(from)}</span>
        <span>{time(to)}</span>
      </div>
    </Card>
  );
}

function Arrow({
  side,
  onClick,
  offset,
}: {
  side: "left" | "right";
  onClick: () => void;
  offset: number;
}) {
  const Icon = side === "left" ? IconChevronLeft : IconChevronRight;
  return (
    <button
      onClick={onClick}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      style={{ [side]: offset + 8 }}
      className="absolute top-1/2 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon size={15} stroke={1.5} />
    </button>
  );
}

export function ServiceCarousel({
  cards,
  from,
  to,
}: {
  cards: ServiceCard[];
  from: number;
  to: number;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [bleed, setBleed] = useState({ left: 0, right: 0 });
  const [at, setAt] = useState({ start: true, end: true });

  /**
   * The row reaches toward the edges of the surrounding content area, but its padding matches the
   * bleed — so the first and last card still line up with the container, and only the middle of the
   * scroll runs past it. Measured rather than expressed in CSS: how much room exists depends on the
   * sidebar, which the user can collapse.
   */
  useEffect(() => {
    const el = wrapper.current;
    // The wrapper carries the negative margin, so measuring it would read its own displacement:
    // ResizeObserver fires once on observe(), by which point the shift is applied and the gap
    // measures zero. The parent never moves, so it is the honest reference.
    const anchor = el?.parentElement;
    const area = el?.closest<HTMLElement>("[data-content-area]");
    if (!el || !anchor || !area) return;

    const measure = () => {
      const own = anchor.getBoundingClientRect();
      const outer = area.getBoundingClientRect();
      setBleed({
        left: Math.max(0, Math.min(own.left - outer.left, MAX_BLEED)),
        right: Math.max(0, Math.min(outer.right - own.right, MAX_BLEED)),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  const syncArrows = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setAt({ start: el.scrollLeft <= 1, end: el.scrollLeft >= max - 1 });
  }, []);

  useEffect(() => {
    syncArrows();
  }, [syncArrows, cards, bleed]);

  const nudge = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    // One card at a time, matching what a click looks like it should do.
    el.scrollBy({ left: direction * 300, behavior: "smooth" });
  };

  return (
    <div
      ref={wrapper}
      className="relative"
      style={{ marginLeft: -bleed.left, marginRight: -bleed.right }}
    >
      {at.start ? null : <Arrow side="left" offset={bleed.left} onClick={() => nudge(-1)} />}
      {at.end ? null : <Arrow side="right" offset={bleed.right} onClick={() => nudge(1)} />}

      {/* Scrollbar hidden, scrolling intact — the trackpad and keyboard still work. */}
      <div
        ref={scroller}
        onScroll={syncArrows}
        className="scrollbar-none flex gap-3 overflow-x-auto"
        style={{ paddingLeft: bleed.left, paddingRight: bleed.right }}
      >
        {cards.map((card) => (
          <ServiceTile key={card.key} card={card} from={from} to={to} />
        ))}
      </div>
    </div>
  );
}
