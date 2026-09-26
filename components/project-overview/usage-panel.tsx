"use client";

import { useSearchParams } from "next/navigation";
import { count as compact } from "@/lib/format";
import { asInterval, successRate, type ServiceCard } from "@/lib/logs-sql";
import { INTERVAL_LABELS, IntervalPicker } from "@/components/interval-picker";
import { ServiceCarousel, ServiceCarouselSkeleton } from "@/components/service-carousel";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";

type Usage = {
  from: number;
  to: number;
  /** Where the sampled rows begin when the read hit the endpoint's cap; null when nothing was cut. */
  sampledFrom: number | null;
  cards: ServiceCard[];
};

/** "12 minutes", "3 hours". `timeAgo` phrases a past moment, and this is a span. */
function span(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

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
  // retry: 0 — the logs endpoint throttles on a schedule nobody here can predict, and the default
  // single retry would spend an attempt on a limit that only waiting clears.
  const usage = useProjectPart<Usage>(projectRef, "logs", { interval }, { retry: 0 });

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
            {isWaiting(usage) ? (
              // h-8: `text-2xl` below is a 32px line box, and a shorter box moves the row it is
              // baseline-aligned in when the figure lands.
              <Skeleton className="h-8 w-16" />
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

      {isWaiting(usage) ? (
        <ServiceCarouselSkeleton />
      ) : usage.status !== "ready" ? (
        <Card className="p-6 text-center text-sm text-subtle">{reasonOf(usage)}</Card>
      ) : total === 0 ? (
        <Card className="p-6 text-center text-sm text-subtle">
          No requests in the {INTERVAL_LABELS[interval].toLowerCase()}.
        </Card>
      ) : (
        <>
          <ServiceCarousel cards={cards} from={usage.data.from} to={usage.data.to} />
          {usage.data.sampledFrom === null ? null : (
            // The endpoint returns at most 1000 rows whatever the statement asks for, so on a busy
            // project the bars and the figures cover different ranges. Unsaid, that reads as a bug.
            <p className="text-center text-xs text-subtle">
              Bars cover the last {span(usage.data.to - usage.data.sampledFrom)}. Totals cover the
              full window.
            </p>
          )}
        </>
      )}
    </section>
  );
}
