import type { Bucket } from "@/lib/logs-sql";

/** Fraction of each slot the bar fills; the rest is the gap between neighbours. */
const BAR = 0.55;

/**
 * One thin bar per time bucket, stacked errors → warnings → successes from the baseline up.
 *
 * The three colours are the design system's status roles, not a categorical set: they mean the same
 * thing everywhere in the app and are never reassigned. Identity never rests on colour alone — the
 * card header spells out WARNINGS and ERRORS beside their counts.
 */
export function StackedBars({ buckets, label }: { buckets: Bucket[]; label: string }) {
  const peak = Math.max(1, ...buckets.map((b) => b.ok + b.warn + b.err));
  // One unit per bucket, so BAR is a true fraction of each slot rather than a fixed subtraction
  // that leaves bars touching at high bucket counts and floating apart at low ones.
  const slots = Math.max(buckets.length, 1);

  return (
    <svg
      viewBox={`0 0 ${slots} 40`}
      preserveAspectRatio="none"
      className="h-24 w-full"
      role="img"
      aria-label={`${label} requests over time`}
    >
      {buckets.map((bucket, index) => {
        const x = index + (1 - BAR) / 2;
        const scale = 40 / peak;
        const segments = [
          { value: bucket.err, fill: "var(--destructive)" },
          { value: bucket.warn, fill: "var(--color-warn)" },
          { value: bucket.ok, fill: "var(--primary)" },
        ];

        let y = 40;
        return segments.map(({ value, fill }, part) => {
          if (value <= 0) return null;
          const h = value * scale;
          y -= h;
          return <rect key={`${index}-${part}`} x={x} y={y} width={BAR} height={h} fill={fill} />;
        });
      })}
    </svg>
  );
}
