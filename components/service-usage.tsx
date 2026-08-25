import { getApiCounts, type ApiCountPoint, type UsageInterval } from "@/lib/mgmt-api";
import { safe } from "@/lib/safe";
import { count as compact } from "@/lib/format";
import { Card } from "./ui/card";
import { IntervalPicker } from "./interval-picker";
import { Sparkline } from "./sparkline";

/**
 * A KPI row of stat tiles, one per service, each with its own trend line.
 *
 * Not one combined chart: REST typically runs two orders of magnitude above Storage, and putting
 * them on a shared axis would flatten the smaller series into the baseline. Faceting keeps every
 * series readable on its own scale — and because each tile plots the same measure, they all share
 * one hue rather than being given four, which would imply four different measures.
 */
const SERIES: { key: keyof Omit<ApiCountPoint, "timestamp">; label: string }[] = [
  { key: "total_rest_requests", label: "REST" },
  { key: "total_auth_requests", label: "Auth" },
  { key: "total_storage_requests", label: "Storage" },
  { key: "total_realtime_requests", label: "Realtime" },
];

export async function ServiceUsage({
  token,
  projectRef,
  interval,
}: {
  token: string;
  projectRef: string;
  interval: UsageInterval;
}) {
  const counts = await safe(() => getApiCounts(token, projectRef, interval));
  const points = counts?.result ?? [];

  const totals = SERIES.map(({ key, label }) => ({
    label,
    values: points.map((p) => Number(p[key] ?? 0)),
    total: points.reduce((sum, p) => sum + Number(p[key] ?? 0), 0),
  }));

  const grandTotal = totals.reduce((sum, s) => sum + s.total, 0);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {/* The one hero figure on this view. */}
          <div className="text-5xl tabular-nums text-foreground">{compact(grandTotal)}</div>
          <div className="text-sm text-subtle">Total requests</div>
        </div>
        <IntervalPicker value={interval} />
      </div>

      {points.length === 0 ? (
        <Card className="p-6 text-center text-sm text-subtle">No request data for this period.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {totals.map((series) => (
            <Card key={series.label} className="gap-0 p-4">
              <div className="text-[11px] uppercase tracking-wide text-subtle">{series.label}</div>
              <div className="mt-1 text-2xl tabular-nums text-foreground">{compact(series.total)}</div>
              <div className="mt-3">
                <Sparkline values={series.values} label={series.label} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
