"use client";

import { Bar, BarChart, ResponsiveContainer, YAxis } from "recharts";
import type { Bucket } from "@/lib/logs-sql";

/**
 * One thin bar per time bucket, stacked errors → warnings → successes from the baseline up.
 *
 * The three colours are the design system's status roles, not a categorical set: they mean the same
 * thing everywhere in the app and are never reassigned. Identity never rests on colour alone — the
 * card header spells out WARNINGS and ERRORS beside their counts.
 *
 * No axes, no grid, no tooltip: this is a sparkline inside a card that already states the totals,
 * and the timestamps under it come from the card. Recharts draws it so that every chart in the app
 * animates and behaves the same way; the card is what explains it.
 *
 * Imported through `next/dynamic` by the carousel, so recharts stays out of the project page's
 * first load.
 */
export function StackedBars({ buckets, label }: { buckets: Bucket[]; label: string }) {
  return (
    <div className="h-24 w-full" role="img" aria-label={`${label} requests over time`}>
      <ResponsiveContainer width="100%" height="100%">
        {/* accessibilityLayer off: it makes the chart a tab stop driving a tooltip, and there is no
            tooltip here — six services would add six unnamed stops inside a scrolling row, each of
            which scrolls the carousel sideways when focused. */}
        <BarChart
          data={buckets}
          accessibilityLayer={false}
          barCategoryGap="20%"
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
          {/* Hidden, but not absent: without a shared domain each series would scale to itself and
              the stack would not add up. */}
          <YAxis hide domain={[0, "dataMax"]} />
          {/* isAnimationActive is left at its default, which is already
              `not server-rendered and not prefers-reduced-motion`. */}
          <Bar dataKey="err" stackId="s" fill="var(--destructive)" />
          <Bar dataKey="warn" stackId="s" fill="var(--color-warn)" />
          <Bar dataKey="ok" stackId="s" fill="var(--primary)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
