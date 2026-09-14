"use client";

import { useMemo, useState } from "react";
import {
  buildPoints,
  chartProblem,
  columnsOf,
  defaultChoice,
  MAX_POINTS,
  numericColumns,
  scaleOf,
  type Point,
  type Row,
} from "@/lib/chart-data";
import { cn } from "@/lib/utils";

/**
 * The current result set, plotted.
 *
 * Hand-rolled SVG, following `components/stacked-bars.tsx`. The alternatives were checked against
 * the registry rather than reputation, 2026-09-14: recharts 3.10.1 is 7.4MB unpacked, chart.js
 * 4.5.1 is 6.2MB, uplot 1.6.32 is 545KB. Two chart types over an ad-hoc result is not worth any of
 * them on a route that an entire other plan exists to make faster — and none of them would do the
 * part that is actually hard, which is deciding what to plot. That lives in `lib/chart-data.ts`,
 * tested.
 *
 * Which columns were chosen is always visible and always overridable: a chart built on the wrong
 * column looks perfectly fine and means nothing.
 */
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
  const [chosen, setChosen] = useState<{ x: string; y: string } | null>(null);

  // A choice naming a column this result does not have is dropped rather than carried between
  // statements: the same tab runs one query after another, and they share no columns.
  const x = chosen && columns.includes(chosen.x) ? chosen.x : (fallback.x ?? "");
  const y = chosen && numeric.includes(chosen.y) ? chosen.y : (fallback.y ?? "");

  const { points, skipped } = useMemo(
    () => (problem ? { points: [], skipped: 0 } : buildPoints(visible, x, y)),
    [visible, x, y, problem],
  );

  if (problem) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-subtle">
        {problem}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 text-[11px]">
        <div className="flex overflow-hidden rounded-md border border-border">
          {(["bar", "line"] as const).map((option) => (
            <button
              key={option}
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

        <Picker label="x" value={x} options={columns} onChange={(next) => setChosen({ x: next, y })} />
        <Picker label="y" value={y} options={numeric} onChange={(next) => setChosen({ x, y: next })} />

        <span className="ml-auto text-subtle">
          {points.length} point{points.length === 1 ? "" : "s"}
          {skipped > 0 ? ` · ${skipped} row${skipped === 1 ? "" : "s"} without a number left out` : ""}
          {rows.length > MAX_POINTS ? ` · first ${MAX_POINTS} of ${rows.length} rows` : ""}
        </span>
      </div>

      <div className="min-h-0 flex-1 p-3">
        {points.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-subtle">
            Nothing in {y} is a number, so there is nothing to plot.
          </div>
        ) : (
          <Plot points={points} kind={kind} label={`${y} by ${x}`} />
        )}
      </div>
    </div>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1 text-subtle">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-transparent px-1.5 py-0.5 text-foreground"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

const HEIGHT = 240;
const PAD = { left: 56, right: 8, top: 8, bottom: 44 };

/**
 * One SVG, sized in pixels rather than scaled by `preserveAspectRatio`, so the text on the axes does
 * not stretch with the container the way `stacked-bars.tsx` deliberately lets its bars.
 *
 * The vertical scale always includes zero. A bar chart whose baseline is not zero exaggerates every
 * difference on it, which is the oldest way to make a chart lie by accident.
 */
function Plot({ points, kind, label }: { points: Point[]; kind: "bar" | "line"; label: string }) {
  const width = Math.max(320, PAD.left + PAD.right + points.length * (kind === "bar" ? 28 : 12));
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;

  // Scale and ticks come from lib/chart-data.ts, where they are tested: a scale can lie as quietly
  // as an inference can, and an all-zero result used to put the baseline at the top of the frame.
  const { top, bottom, ticks } = scaleOf(points);
  const span = top - bottom;

  const yOf = (value: number) => PAD.top + ((top - value) / span) * plotHeight;
  const slot = plotWidth / points.length;
  const xOf = (index: number) => PAD.left + slot * (index + 0.5);

  const zero = yOf(0);

  // Every label would overlap past a few dozen bars; thinning keeps the axis readable and honest,
  // since the points themselves are all still drawn.
  const every = Math.ceil(points.length / 12);

  return (
    <div className="h-full overflow-x-auto">
      <svg width={width} height={HEIGHT} role="img" aria-label={label} className="text-subtle">
        {ticks.map((value, index) => (
          <g key={index}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={yOf(value)}
              y2={yOf(value)}
              stroke="var(--border)"
            />
            <text x={PAD.left - 6} y={yOf(value) + 3} textAnchor="end" fontSize={10} fill="currentColor">
              {format(value)}
            </text>
          </g>
        ))}

        {kind === "bar" ? (
          points.map((point, index) => {
            const height = Math.abs(yOf(point.value) - zero);
            return (
              <rect
                key={index}
                x={xOf(index) - slot * 0.3}
                y={Math.min(yOf(point.value), zero)}
                width={Math.max(1, slot * 0.6)}
                height={Math.max(1, height)}
                fill="var(--primary)"
              >
                <title>{`${point.label}: ${point.value}`}</title>
              </rect>
            );
          })
        ) : (
          <>
            <polyline
              fill="none"
              stroke="var(--primary)"
              strokeWidth={1.5}
              points={points.map((p, i) => `${xOf(i)},${yOf(p.value)}`).join(" ")}
            />
            {points.map((point, index) => (
              <circle key={index} cx={xOf(index)} cy={yOf(point.value)} r={2} fill="var(--primary)">
                <title>{`${point.label}: ${point.value}`}</title>
              </circle>
            ))}
          </>
        )}

        {points.map((point, index) =>
          index % every === 0 ? (
            <text
              key={index}
              x={xOf(index)}
              y={HEIGHT - PAD.bottom + 14}
              fontSize={10}
              fill="currentColor"
              textAnchor="end"
              transform={`rotate(-35 ${xOf(index)} ${HEIGHT - PAD.bottom + 14})`}
            >
              {point.label.length > 18 ? `${point.label.slice(0, 17)}…` : point.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

/**
 * Short, because an axis is not the place to read fifteen significant figures — but by significant
 * digits rather than decimal places, or a result of rates and ratios prints "0" three times beside
 * bars that are visibly different heights.
 */
const format = (value: number) =>
  Math.abs(value) >= 1000
    ? value.toLocaleString(undefined, { notation: "compact" })
    : value.toLocaleString(undefined, { maximumSignificantDigits: 4 });
