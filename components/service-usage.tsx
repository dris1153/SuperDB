import { count as compact } from "@/lib/format";
import {
  buildServiceLogsSql,
  bucketUnit,
  successRate,
  toCards,
  windowMinutes,
  type ChartInterval,
  type LogRow,
} from "@/lib/logs-sql";
import { queryLogs } from "@/lib/mgmt-api";
import { attempt } from "@/lib/safe";
import { IntervalPicker } from "./interval-picker";
import { ServiceCarousel } from "./service-carousel";
import { Card } from "./ui/card";

export async function ServiceUsage({
  token,
  projectRef,
  interval,
}: {
  token: string;
  projectRef: string;
  interval: ChartInterval;
}) {
  const minutes = windowMinutes(interval);
  const to = Date.now();
  const from = to - minutes * 60_000;

  const unit = bucketUnit(minutes);

  const rows = await attempt(() =>
    queryLogs<LogRow>(
      token,
      projectRef,
      buildServiceLogsSql(unit),
      new Date(from).toISOString(),
      new Date(to).toISOString(),
    ),
  );

  const cards = rows.ok ? toCards(rows.data, { from, to, unit }) : [];
  const total = cards.reduce((sum, c) => sum + c.total, 0);
  const warn = cards.reduce((sum, c) => sum + c.warn, 0);
  const err = cards.reduce((sum, c) => sum + c.err, 0);
  const rate = successRate(total, warn, err);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl tabular-nums text-foreground">{compact(total)}</span>
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

      {!rows.ok ? (
        <Card className="p-6 text-center text-sm text-subtle">{rows.reason}</Card>
      ) : total === 0 ? (
        <Card className="p-6 text-center text-sm text-subtle">
          No request data for this period.
        </Card>
      ) : (
        <ServiceCarousel cards={cards} from={from} to={to} />
      )}
    </section>
  );
}
