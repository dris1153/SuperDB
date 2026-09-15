/**
 * Per-service request counts, read from the project's log sources.
 *
 * `usage.api-counts` cannot answer this: it reports four services and no severity at all, so it has
 * no way to produce a success rate, an API Gateway figure, or a Postgres one. The log sources carry
 * both, at the cost of writing the classification per source — each has its own schema.
 *
 * Every field below was verified against a live project; a name that does not exist fails the query
 * outright rather than quietly counting zero.
 */
export type ServiceKey = "edge" | "auth" | "postgres" | "storage" | "realtime" | "functions";

export const SERVICES: { key: ServiceKey; label: string }[] = [
  { key: "edge", label: "API Gateway" },
  { key: "auth", label: "Auth" },
  { key: "postgres", label: "Postgres" },
  { key: "storage", label: "Storage" },
  { key: "realtime", label: "Realtime" },
  { key: "functions", label: "Edge Functions" },
];

export type LogRow = { service: string; bucket: number; total: number; warn: number; err: number };

export type Bucket = { at: number; ok: number; warn: number; err: number };

export type ServiceCard = {
  key: ServiceKey;
  label: string;
  total: number;
  warn: number;
  err: number;
  buckets: Bucket[];
};

/** The windows the picker offers. Free projects keep one day of logs, so nothing longer. */
export type ChartInterval = "15min" | "30min" | "1hr" | "1day";

const WINDOW_MINUTES: Record<ChartInterval, number> = {
  "15min": 15,
  "30min": 30,
  "1hr": 60,
  "1day": 1440,
};

const STEP_MS: Record<string, number> = { minute: 60_000, hour: 3_600_000 };

export const windowMinutes = (interval: ChartInterval) => WINDOW_MINUTES[interval];

export const INTERVALS: ChartInterval[] = ["15min", "30min", "1hr", "1day"];

/** Whatever arrived in the URL, resolved to an interval. An unknown one is the default, not an error. */
export const asInterval = (raw: string | null | undefined): ChartInterval =>
  INTERVALS.includes(raw as ChartInterval) ? (raw as ChartInterval) : "1hr";

/** 15, 30 or 60 bars for the short windows; 24 for a day. timestamp_trunc has nothing in between. */
export const bucketUnit = (minutes: number) => (minutes <= 90 ? "minute" : "hour");

/** Status codes, for the two sources that speak HTTP. */
const httpBranch = (service: ServiceKey, table: string, unit: string) => `
select "${service}" as service, timestamp_trunc(t.timestamp, ${unit}) as bucket,
  countif(r.status_code >= 500) as err,
  countif(r.status_code >= 400 and r.status_code < 500) as warn,
  count(*) as total
from ${table} t cross join unnest(t.metadata) m cross join unnest(m.response) r
group by bucket`;

/** Log levels, for the services that emit them instead of status codes. */
const levelBranch = (service: ServiceKey, table: string, unit: string) => `
select "${service}" as service, timestamp_trunc(t.timestamp, ${unit}) as bucket,
  countif(m.level = "error" or m.level = "fatal") as err,
  countif(m.level = "warning" or m.level = "warn") as warn,
  count(*) as total
from ${table} t cross join unnest(t.metadata) m
group by bucket`;

/** Postgres nests its severity a level deeper and spells it in caps. */
const postgresBranch = (unit: string) => `
select "postgres" as service, timestamp_trunc(t.timestamp, ${unit}) as bucket,
  countif(pr.error_severity in ("ERROR","FATAL","PANIC")) as err,
  countif(pr.error_severity = "WARNING") as warn,
  count(*) as total
from postgres_logs t cross join unnest(t.metadata) m cross join unnest(m.parsed) pr
group by bucket`;

/**
 * One statement rather than six requests. The Management API throttles at roughly a minute's worth
 * of calls and this page already spends eight of them, so six more would make a reload a coin flip.
 */
export function buildServiceLogsSql(unit: string): string {
  return [
    httpBranch("edge", "edge_logs", unit),
    levelBranch("auth", "auth_logs", unit),
    postgresBranch(unit),
    levelBranch("storage", "storage_logs", unit),
    levelBranch("realtime", "realtime_logs", unit),
    httpBranch("functions", "function_edge_logs", unit),
  ].join("\nunion all\n");
}

/**
 * Cards carry every service, so an idle one still shows up — dimmed — rather than vanishing, and
 * every bucket in the window is present even when nothing happened in it.
 *
 * That gap filling is what keeps the bars a constant width: the query returns only the buckets that
 * saw traffic, so four busy minutes in an hour would otherwise be drawn as four bars stretched
 * across the whole card, implying steady traffic that never happened.
 */
export function toCards(
  rows: LogRow[],
  window: { from: number; to: number; unit: string },
): ServiceCard[] {
  const step = STEP_MS[window.unit] ?? STEP_MS.minute;
  const first = Math.floor(window.from / step) * step;

  const slots: number[] = [];
  for (let at = first; at <= window.to; at += step) slots.push(at);

  const cards = SERVICES.map(({ key, label }) => {
    const mine = rows.filter((r) => r.service === key);
    // Logflare returns microseconds since the epoch.
    const byTime = new Map(mine.map((r) => [Math.round(r.bucket / 1000), r]));

    const buckets: Bucket[] = slots.map((at) => {
      const row = byTime.get(at);
      return {
        at,
        ok: row ? Math.max(0, row.total - row.warn - row.err) : 0,
        warn: row?.warn ?? 0,
        err: row?.err ?? 0,
      };
    });

    return {
      key,
      label,
      // Summed from the rows, not the slots, so a bucket that lands outside the generated range
      // still counts toward the headline figure instead of disappearing.
      total: mine.reduce((sum, r) => sum + r.total, 0),
      warn: mine.reduce((sum, r) => sum + r.warn, 0),
      err: mine.reduce((sum, r) => sum + r.err, 0),
      buckets,
    };
  });

  return cards.sort((a, b) => b.total - a.total);
}

/** Anything that is not a warning or an error counts as a success, as Supabase's own figure does. */
export function successRate(total: number, warn: number, err: number): number | null {
  if (total <= 0) return null;
  return 100 - ((warn + err) / total) * 100;
}
