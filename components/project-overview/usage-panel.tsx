"use client";

import { useSearchParams } from "next/navigation";
import { count as compact } from "@/lib/format";
import { asInterval, successRate, type ServiceCard } from "@/lib/logs-sql";
import { IntervalPicker } from "@/components/interval-picker";
import { ServiceCarousel, ServiceCarouselSkeleton } from "@/components/service-carousel";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { reasonOf, useProjectPart } from "@/components/use-project-part";

type Usage = { from: number; to: number; cards: ServiceCard[] };

/**
 * Requests per service over the chosen window.
 *
 * The slowest thing on this page and the one people wait for least, so it is a query like the rest
 * rather than the Suspense boundary it used to be — the totals above it now change without the page
 * re-rendering on the server.
 *
 * The interval lives in the URL, so it survives a reload and a shared link. `IntervalPicker` updates
 * it through the history API rather than by navigating, which makes switching a key change here
 * instead of a round trip.
 */
export function UsagePanel({ projectRef }: { projectRef: string }) {
  const interval = asInterval(useSearchParams().get("interval"));
  const usage = useProjectPart<Usage>(projectRef, "logs", { interval });

  const cards = usage.status === "ready" ? usage.data.cards : [];
  const total = cards.reduce((sum, c) => sum + c.total, 0);
  const warn = cards.reduce((sum, c) => sum + c.warn, 0);
  const err = cards.reduce((sum, c) => sum + c.err, 0);
  const rate = successRate(total, warn, err);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div className="flex items-baseline gap-2">
            {usage.status === "pending" ? (
              <Skeleton className="inline-block h-7 w-16" />
            ) : usage.status === "ready" ? (
              <span className="text-2xl tabular-nums text-foreground">{compact(total)}</span>
            ) : (
              // Not zero: nothing was counted, and printing 0 above a card explaining why would be
              // two different answers to the same question.
              <span className="text-2xl text-subtle">—</span>
            )}
            <span className="text-sm text-muted-foreground">Total Requests</span>
          </div>
          {rate === null ? null : (
            <div className="flex items-baseline gap-2">
              <span className="text-2xl tabular-nums text-foreground">{rate.toFixed(1)}%</span>
              <span className="text-sm text-muted-foreground">Success Rate</span>
            </div>
          )}
        </div>
        <IntervalPicker value={interval} />
      </div>

      {usage.status === "pending" || usage.status === "idle" ? (
        <ServiceCarouselSkeleton />
      ) : usage.status !== "ready" ? (
        <Card className="p-6 text-center text-sm text-subtle">{reasonOf(usage)}</Card>
      ) : total === 0 ? (
        <Card className="p-6 text-center text-sm text-subtle">No request data for this period.</Card>
      ) : (
        <ServiceCarousel cards={cards} from={usage.data.from} to={usage.data.to} />
      )}
    </section>
  );
}
