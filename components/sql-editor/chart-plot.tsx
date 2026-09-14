"use client";

import { labelStride, scaleOf, type Point } from "@/lib/chart-data";

/** Where a label is cut, and the width the axis budgets for one. */
const LABEL_MAX = 22;

/**
 * The plot itself.
 *
 * Drawn at a measured pixel width rather than scaled by `preserveAspectRatio`, so axis text keeps
 * its size — the opposite of `stacked-bars.tsx`, which has no text to distort. It fills the space it
 * is given and only scrolls when the points genuinely need more room than that.
 *
 * The vertical scale always includes zero, and comes from `lib/chart-data.ts` where it is tested. A
 * bar chart with a floating baseline exaggerates every difference on it.
 */
export function ChartPlot({
  points,
  kind,
  width,
  height,
  showLabels,
  showGrid,
  label,
}: {
  points: Point[];
  kind: "bar" | "line";
  /** The container's measured width. Nothing is drawn until it is known. */
  width: number;
  height: number;
  showLabels: boolean;
  showGrid: boolean;
  label: string;
}) {
  const pad = { left: 52, right: 16, top: 12, bottom: showLabels ? 30 : 12 };

  // Enough room per point to stay readable; past that the chart scrolls rather than compressing
  // bars into a smear.
  const minimum = pad.left + pad.right + points.length * (kind === "bar" ? 28 : 10);
  const drawWidth = Math.max(width, minimum);
  const plotWidth = drawWidth - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;

  const { top, bottom, ticks } = scaleOf(points);
  const span = top - bottom;

  const yOf = (value: number) => pad.top + ((top - value) / span) * plotHeight;
  const slot = plotWidth / points.length;
  const xOf = (index: number) => pad.left + slot * (index + 0.5);
  const zero = yOf(0);

  // Room is measured against the longest label rather than assumed: `Sep 1 2026 04:00` needs about
  // twice the width of `42`, and a fixed count would either overlap or throw labels away. Capped at
  // the width labels are actually truncated to, or one JSON value sixty characters long would thin
  // a seven-point axis down to two names.
  const longest = points.reduce((most, p) => Math.min(Math.max(most, p.label.length), LABEL_MAX), 1);
  const stride = labelStride(points.length, Math.floor(plotWidth / (longest * 6 + 18)));

  return (
    <svg width={drawWidth} height={height} role="img" aria-label={label} className="text-subtle">
      {ticks.map((value, index) => (
        <g key={index}>
          <line
            x1={pad.left}
            x2={drawWidth - pad.right}
            y1={yOf(value)}
            y2={yOf(value)}
            stroke="var(--border)"
            strokeOpacity={showGrid ? 1 : 0.35}
          />
          <text x={pad.left - 8} y={yOf(value) + 3} textAnchor="end" fontSize={10} fill="currentColor">
            {format(value)}
          </text>
        </g>
      ))}

      {showGrid
        ? points.map((_, index) =>
            index % stride === 0 ? (
              <line
                key={`grid-${index}`}
                x1={xOf(index)}
                x2={xOf(index)}
                y1={pad.top}
                y2={height - pad.bottom}
                stroke="var(--border)"
                strokeOpacity={0.5}
              />
            ) : null,
          )
        : null}

      {kind === "bar" ? (
        points.map((point, index) => (
          <rect
            key={index}
            x={xOf(index) - Math.min(slot * 0.35, 22)}
            y={Math.min(yOf(point.value), zero)}
            width={Math.max(2, Math.min(slot * 0.7, 44))}
            height={Math.max(1, Math.abs(yOf(point.value) - zero))}
            rx={2}
            fill="var(--primary)"
          >
            <title>{`${point.label}: ${point.value}`}</title>
          </rect>
        ))
      ) : (
        <>
          <polyline
            fill="none"
            stroke="var(--primary)"
            strokeWidth={1.5}
            points={points.map((p, i) => `${xOf(i)},${yOf(p.value)}`).join(" ")}
          />
          {points.map((point, index) => (
            <circle key={index} cx={xOf(index)} cy={yOf(point.value)} r={2.5} fill="var(--primary)">
              <title>{`${point.label}: ${point.value}`}</title>
            </circle>
          ))}
        </>
      )}

      {showLabels
        ? points.map((point, index) =>
            index % stride === 0 ? (
              <text
                key={`label-${index}`}
                x={xOf(index)}
                y={height - pad.bottom + 16}
                fontSize={10}
                fill="currentColor"
                textAnchor="middle"
              >
                {point.label.length > LABEL_MAX
                  ? `${point.label.slice(0, LABEL_MAX - 1)}…`
                  : point.label}
              </text>
            ) : null,
          )
        : null}
    </svg>
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
