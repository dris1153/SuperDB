/**
 * 12-point trend line for a stat tile: body in the de-emphasis hue, current period in the accent.
 *
 * Hand-drawn SVG rather than a chart library — one series, twelve points, no axes. A dependency
 * would be more code than the component.
 *
 * Colours are computed, not chosen by eye: #4d4d4d measured 2.12:1 against the #171717 card surface,
 * below the 3:1 floor, so the body uses Smoke instead. The accent appears once, as a single dot.
 */
const WIDTH = 120;
const HEIGHT = 28;
const PAD = 4;

export const POINTS = 12;

/** Evenly spaced samples across the series, always keeping the newest value as the last point. */
export function downsample(values: number[], count = POINTS): number[] {
  if (values.length <= count) return values;
  const step = (values.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => values[Math.round(i * step)]);
}

export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const points = downsample(values);
  if (points.length < 2) return <div className="h-7" aria-hidden />;

  const max = Math.max(...points);
  const min = Math.min(...points);
  // A flat series would divide by zero; draw it down the middle instead.
  const span = max - min || 1;
  const stepX = (WIDTH - PAD * 2) / (points.length - 1);

  const coords = points.map((value, index) => {
    const x = PAD + index * stepX;
    const y = max === min ? HEIGHT / 2 : HEIGHT - PAD - ((value - min) / span) * (HEIGHT - PAD * 2);
    return [x, y] as const;
  });

  const [lastX, lastY] = coords[coords.length - 1];

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-7 w-full"
      role="img"
      aria-label={`${label} trend, ${points.length} points, latest ${points[points.length - 1]}`}
    >
      <polyline
        points={coords.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="var(--color-subtle)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={3} fill="var(--primary)" />
    </svg>
  );
}
