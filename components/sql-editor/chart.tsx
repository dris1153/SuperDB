"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buildPoints,
  chartProblem,
  columnsOf,
  cumulative,
  defaultChoice,
  labelFormatter,
  MAX_POINTS,
  numericColumns,
  type Row,
} from "@/lib/chart-data";
import { ChartOptions, type ChartToggles } from "./chart-options";
import { ChartPlot } from "./chart-plot";
import { cn } from "@/lib/utils";

/**
 * The current result set, plotted, with its options beside it.
 *
 * Hand-rolled SVG, following `components/stacked-bars.tsx`. The alternatives were checked against
 * the registry rather than reputation, 2026-09-14: recharts 3.10.1 is 7.4MB unpacked, chart.js
 * 4.5.1 is 6.2MB, uplot 1.6.32 is 545KB. Rechecked when the design bar rose: a library would have
 * replaced about sixty lines of geometry and none of the column inference, the options panel, the
 * cumulative series or the timestamp axis — which is all of the actual work.
 *
 * Which columns were chosen is always visible and always overridable: a chart built on the wrong
 * column looks perfectly fine and means nothing.
 */
const PLOT_HEIGHT = 240;
const DEFAULT_TOGGLES: ChartToggles = { cumulative: true, labels: true, grid: true };

export function Chart({ rows }: { rows: Row[] }) {
  // Everything below reasons about the rows that are actually drawn. Inferring over the whole result
  // and drawing a prefix of it disagrees in both directions: one text value in row 50,000 would take
  // a column out of the picker with no explanation, and a column whose values all sit past the cut
  // would be offered and then plot nothing under the message "nothing here is a number". It also
  // keeps a full scan of an unbounded result off every render.
  const visible = useMemo(() => rows.slice(0, MAX_POINTS), [rows]);

  const problem = useMemo(() => chartProblem(visible), [visible]);
  const columns = useMemo(() => columnsOf(visible), [visible]);
  const numeric = useMemo(() => numericColumns(visible), [visible]);
  const fallback = useMemo(() => defaultChoice(visible), [visible]);

  const [kind, setKind] = useState<"bar" | "line">("bar");
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES);
  const [chosen, setChosen] = useState<{ columns: string; x: string; y: string } | null>(null);

  // Tied to the columns it was made against, so it applies to this result and no other. Matching on
  // the column names alone would let a choice from two statements ago reappear on a third that
  // happens to select the same names.
  const signature = columns.join("\u0000");
  const mine = chosen?.columns === signature ? chosen : null;
  const x = mine && columns.includes(mine.x) ? mine.x : (fallback.x ?? "");
  const y = mine && numeric.includes(mine.y) ? mine.y : (fallback.y ?? "");

  const { points, skipped } = useMemo(() => {
    if (problem) return { points: [], skipped: 0 };
    const built = buildPoints(visible, x, y, labelFormatter(visible, x));
    return toggles.cumulative ? { points: cumulative(built.points), skipped: built.skipped } : built;
  }, [visible, x, y, problem, toggles.cumulative]);

  const [plotRef, plotWidth] = useMeasuredWidth();

  if (problem) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-subtle">
        {problem}
      </div>
    );
  }

  // What the series actually is, said the same way in the legend and in the accessible name: a
  // running total is a different measurement from the one the query returned, and over a truncated
  // result it is a total of the part that was drawn.
  const series =
    y +
    (toggles.cumulative ? (rows.length > MAX_POINTS ? " (cumulative, first rows)" : " (cumulative)") : "");

  const summary = [
    `${points.length} point${points.length === 1 ? "" : "s"}`,
    rows.length > MAX_POINTS ? `first ${MAX_POINTS} of ${rows.length} rows` : null,
    skipped > 0 ? `${skipped} row${skipped === 1 ? "" : "s"} without a number left out` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 px-3 py-1.5 text-[11px]">
          <div className="flex overflow-hidden rounded-md border border-border">
            {(["bar", "line"] as const).map((option) => (
              <button
                key={option}
                aria-pressed={kind === option}
                onClick={() => setKind(option)}
                className={cn(
                  "px-2 py-0.5 capitalize",
                  kind === option ? "bg-muted text-foreground" : "text-subtle hover:bg-muted/60",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div ref={plotRef} className="min-h-0 flex-1 overflow-x-auto px-3">
          {plotWidth > 0 ? (
            // Nothing is drawn until the container has been measured: a guessed width paints a
            // narrow chart and then jumps.
            <ChartPlot
              points={points}
              kind={kind}
              width={plotWidth}
              height={PLOT_HEIGHT}
              showLabels={toggles.labels}
              showGrid={toggles.grid}
              label={`${series} by ${x}`}
            />
          ) : null}
        </div>

        {points.length > 0 ? (
          <div className="shrink-0 space-y-1 px-3 pb-2">
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="size-2 rounded-[2px] bg-primary" aria-hidden />
              {/* Said out loud while it is on: a running total is a different measurement from the
                  one the query returned, and reading one as the other is the mistake this module
                  exists to prevent. */}
              {series}
            </div>
            <div className="flex justify-between font-mono text-[10px] text-subtle">
              <span>{points[0].label}</span>
              <span>{points.at(-1)?.label}</span>
            </div>
          </div>
        ) : null}
      </div>

      <ChartOptions
        columns={columns}
        numeric={numeric}
        x={x}
        y={y}
        toggles={toggles}
        summary={summary}
        onPick={(axis, column) =>
          setChosen(axis === "x" ? { columns: signature, x: column, y } : { columns: signature, x, y: column })
        }
        onFlip={() => setChosen({ columns: signature, x: y, y: x })}
        onToggle={(key, value) => setToggles((current) => ({ ...current, [key]: value }))}
      />
    </div>
  );
}

/**
 * The plot is drawn in pixels, so it has to know how many it has.
 *
 * A callback ref rather than an effect: the measured element sits behind the not-chartable early
 * return, so it mounts and unmounts under this component. An effect with an empty dependency list
 * runs once, before that element exists, and never attaches — leaving the chart measuring zero and
 * rendering nothing at all for a result that followed a non-chartable one in the same tab.
 */
function useMeasuredWidth() {
  const [value, setValue] = useState(0);

  const ref = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setValue(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // A tuple, not an object: a hook returning `{ ref, value }` reads to the lint rules as a ref being
  // unwrapped during render.
  return [ref, value] as const;
}
