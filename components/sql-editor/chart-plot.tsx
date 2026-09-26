"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { scaleOf, type Point } from "@/lib/chart-data";

/** Where a label is cut. Recharts decides how many fit; this caps how long one may be. */
const LABEL_MAX = 22;

/**
 * The plot, on recharts.
 *
 * **The vertical domain comes from `scaleOf`, not from recharts.** Its own default starts at the
 * lowest value rather than at zero, which exaggerates every difference on a bar chart, and it has
 * no answer for an all-zero result — both of which this app fixed once already and has tests for.
 * Handing recharts an explicit domain is what keeps those tests meaningful now that the geometry
 * is no longer ours.
 */
export function ChartPlot({
  points,
  kind,
  height,
  showLabels,
  showGrid,
  label,
}: {
  points: Point[];
  kind: "bar" | "line";
  height: number;
  showLabels: boolean;
  showGrid: boolean;
  /** Names the series in the tooltip and the accessible name, "(cumulative)" included. */
  label: string;
}) {
  // ticks as well as the domain: pinned to the data's exact extremes, recharts generates ticks
  // inside it and crowds the last two together — 0, 350, 700, 1.1K, 1.2K for a domain of [0, 1234].
  // `scaleOf` already answers this, evenly and deduplicated, and its answer is tested.
  const { top, bottom, ticks } = scaleOf(points);

  const margin = { top: 12, right: 16, bottom: 4, left: 0 };
  const axes = (
    <>
      {/* The horizontal lines stay when the grid is off, faintly: they carry the baseline, and a
          mixed-sign result with no line at zero gives no way to see where zero is. Only the
          vertical lines are what "Show grid" removes. */}
      <CartesianGrid
        horizontal
        vertical={showGrid}
        stroke="var(--border)"
        strokeOpacity={showGrid ? 0.5 : 0.25}
      />
      <XAxis
        dataKey="label"
        hide={!showLabels}
        tickLine={false}
        axisLine={{ stroke: "var(--border)" }}
        tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
        tickFormatter={(value: string) =>
          value.length > LABEL_MAX ? `${value.slice(0, LABEL_MAX - 1)}…` : value
        }
        minTickGap={16}
        interval="preserveStartEnd"
      />
      <YAxis
        domain={[bottom, top]}
        ticks={ticks}
        tickLine={false}
        axisLine={false}
        width={52}
        tick={{ fill: "var(--color-subtle)", fontSize: 10 }}
        tickFormatter={format}
      />
      <Tooltip
        cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
        contentStyle={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 6,
          fontSize: 12,
        }}
        labelStyle={{ color: "var(--color-subtle)" }}
        itemStyle={{ color: "var(--foreground)" }}
      />
    </>
  );

  return (
    // No role="img" on the wrapper: recharts' accessibility layer makes its own svg focusable, and
    // a focusable element inside an image role is one an assistive technology cannot describe. The
    // label goes on the chart itself, which is the element that takes focus and drives the tooltip.
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart data={points} margin={margin} aria-label={label}>
            {axes}
            {/* minPointSize: a zero still marks its category with a hairline, as the hand-rolled
                version did, rather than vanishing from the axis. */}
            <Bar dataKey="value" name={label} fill="var(--primary)" radius={[2, 2, 0, 0]} minPointSize={1} />
          </BarChart>
        ) : (
          <LineChart data={points} margin={margin} aria-label={label}>
            {axes}
            <Line
              type="monotone"
              dataKey="value"
              name={label}
              stroke="var(--primary)"
              strokeWidth={1.5}
              dot={{ r: 2.5, fill: "var(--primary)" }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Short, because an axis is not the place to read fifteen significant figures — but by significant
 * digits rather than decimal places, or a result of rates and ratios prints "0" three times beside
 * bars of visibly different heights.
 */
const format = (value: number) =>
  Math.abs(value) >= 1000
    ? value.toLocaleString(undefined, { notation: "compact" })
    : value.toLocaleString(undefined, { maximumSignificantDigits: 4 });
