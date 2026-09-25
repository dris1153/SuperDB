/**
 * Per-service request counts, read from the project's log sources.
 *
 * `usage.api-counts` cannot answer this: it reports four services and no severity at all, so it has
 * no way to produce a success rate, an API Gateway figure, or a Postgres one. The log sources carry
 * both, at the cost of classifying each source's own vocabulary here.
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

/**
 * Which source in the stream answers for each card.
 *
 * The names survived the migration as column values. `function_edge_logs` was not among the eight
 * sources the measured project had — it has no Edge Functions — so that name is unverified. A source
 * matching no rows leaves the card reading as idle rather than breaking anything.
 */
export const SOURCE: Record<ServiceKey, string> = {
  edge: "edge_logs",
  auth: "auth_logs",
  postgres: "postgres_logs",
  storage: "storage_logs",
  realtime: "realtime_logs",
  functions: "function_edge_logs",
};

/** One row of the stream, as the endpoint returns it. */
export type LogEntry = {
  source: string;
  severity_text: string | null;
  timestamp: string;
  event_message: string | null;
};

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

/** 15, 30 or 60 bars for the short windows; 24 for a day. */
export const bucketUnit = (minutes: number) => (minutes <= 90 ? "minute" : "hour");

const quoted = (sources: string[]) => sources.map((s) => `'${s}'`).join(",");

const CARD_SOURCES = quoted(Object.values(SOURCE));

/**
 * Every card's figures, counted over the whole window, in one statement.
 *
 * What the endpoint accepts is narrower than SQL and wider than it first looked. It refuses
 * `countif`, `timestamp_trunc`, `cast` and `starts_with` — every refusal reading `Backend error!
 * Retry your query`, which names nothing, so each was found by elimination. It accepts `group by`,
 * `count(*)`, `sum(case when … end)`, plain comparisons, `like` with `_`, and `offset`.
 *
 * Both classifications ride along: the severity columns answer for the four sources that emit
 * levels, and the message columns for the two that are always `INFO` even on a 500. Each row
 * carries both; `figuresFor` takes the pair that means something for that source.
 *
 * The `like` counts are checked against `classify()` rather than assumed — on 114 `edge_logs` rows
 * the server answered 15 / 2 for 4xx / 5xx, which is what the parser returns for the same rows.
 * Same dependency on the message format as `statusFromMessage`, not a second one.
 *
 * `pgbouncer_logs` is left out deliberately: 5570 rows of the 6088 in a measured day, and no card
 * shows it.
 */
export function buildFiguresSql(): string {
  const words = (set: Set<string>) => quoted([...set]);

  return `select source,
  count(*) as n,
  sum(case when severity_text in (${words(ERROR_WORDS)}) then 1 else 0 end) as sev_err,
  sum(case when severity_text in (${words(WARN_WORDS)}) then 1 else 0 end) as sev_warn,
  sum(case when event_message like '% | 5__ | %' then 1 else 0 end) as http_err,
  sum(case when event_message like '% | 4__ | %' then 1 else 0 end) as http_warn
from logs
where source in (${CARD_SOURCES})
group by source`;
}

/**
 * The cap, which the server applies whatever the statement asks for: `limit 5000`, `limit 10000`
 * and `limit 50000` all answered with exactly 1000 rows. Written here so the number on the wire is
 * the number the caller can reason about.
 */
export const SAMPLE_LIMIT = 1000;

/**
 * Rows for the shape of the traffic — not for the figures, which `buildTotalsSql` answers exactly.
 *
 * Newest first across every source at once, so a chatty source takes the sample from a quiet one.
 * That is survivable for a distribution and was not survivable for a total: a starved service used
 * to read as zero requests rather than as few.
 */
export function buildSampleSql(): string {
  return `select source, severity_text, timestamp, event_message
from logs
where source in (${CARD_SOURCES})
order by timestamp desc
limit ${SAMPLE_LIMIT}`;
}

/** Postgres, syslog and GoTrue vocabulary, measured per source and merged — they do not collide. */
const ERROR_WORDS = new Set(["ERROR", "FATAL", "PANIC", "CRITICAL"]);
const WARN_WORDS = new Set(["WARNING", "WARN"]);

/**
 * The HTTP status out of an edge row's message, which reads `GET | 200 | 1.2.3.4 | …`.
 *
 * `edge_logs` is only ever `INFO`, including a row reading `DELETE | 204 | …`, so severity cannot
 * classify it. The status is also in `log_attributes`, but every function that could reach in there
 * fails, so this parses the message instead.
 *
 * **It depends on a string format nobody promised.** A message that does not match returns null and
 * the row counts as a success — the safe direction for a format that may change without warning.
 */
export function statusFromMessage(message: string | null): number | null {
  if (!message) return null;

  const parts = message.split("|");
  if (parts.length < 2) return null;

  const status = Number(parts[1].trim());
  return Number.isInteger(status) && status >= 100 && status < 600 ? status : null;
}

/** Where one row lands: an error, a warning, or neither. */
export function classify(entry: LogEntry): "err" | "warn" | "ok" {
  if (entry.source === SOURCE.edge || entry.source === SOURCE.functions) {
    const status = statusFromMessage(entry.event_message);
    if (status === null) return "ok";
    if (status >= 500) return "err";
    return status >= 400 ? "warn" : "ok";
  }

  const severity = (entry.severity_text ?? "").toUpperCase();
  if (ERROR_WORDS.has(severity)) return "err";
  return WARN_WORDS.has(severity) ? "warn" : "ok";
}

/**
 * The endpoint's timestamps carry no zone: `2026-09-25T12:49:33.481143`.
 *
 * `new Date()` reads that as **local** time, which would shift every bucket by the reader's offset
 * and, in Vietnam, put the last seven hours of logs in the future. They are UTC.
 */
export function parseLogTime(timestamp: string): number {
  const iso = /[Zz]|[+-]\d{2}:?\d{2}$/.test(timestamp) ? timestamp : `${timestamp}Z`;
  return new Date(iso).getTime();
}

/** One row of `buildFiguresSql`: a source, its size, and both readings of its failures. */
export type FigureRow = {
  source: string;
  n: number;
  sev_err: number;
  sev_warn: number;
  http_err: number;
  http_warn: number;
};

export type Figures = { total: number; warn: number; err: number };

/**
 * What each card says, counted over the whole window rather than over whatever fitted in the
 * sample.
 *
 * A source the query did not answer for keeps its zeros: the card reads as idle, which is what an
 * absent source means.
 */
export function figuresFor(rows: FigureRow[]): Record<ServiceKey, Figures> {
  const figures = Object.fromEntries(
    SERVICES.map(({ key }) => [key, { total: 0, warn: 0, err: 0 }]),
  ) as Record<ServiceKey, Figures>;

  for (const { key } of SERVICES) {
    const row = rows.find((r) => r.source === SOURCE[key]);
    if (!row) continue;

    // Both readings arrive for every source, and only one of them means anything. Reading severity
    // for edge would call a window full of 500s a perfect success, since every edge row is `INFO`.
    const http = SOURCE[key] === SOURCE.edge || SOURCE[key] === SOURCE.functions;

    figures[key] = {
      total: row.n,
      warn: http ? row.http_warn : row.sev_warn,
      err: http ? row.http_err : row.sev_err,
    };
  }

  return figures;
}

/**
 * Cards carry every service, so an idle one still shows up — dimmed — rather than vanishing, and
 * every bucket in the window is present even when nothing happened in it.
 *
 * That gap filling is what keeps the bars a constant width: only the buckets that saw traffic have
 * counts, so four busy minutes in an hour would otherwise be drawn as four bars stretched across
 * the whole card, implying steady traffic that never happened.
 */
export function toCards(
  entries: LogEntry[],
  window: { from: number; to: number; unit: string },
  figures: Record<ServiceKey, Figures>,
): ServiceCard[] {
  const step = STEP_MS[window.unit] ?? STEP_MS.minute;
  const first = Math.floor(window.from / step) * step;

  const slots: number[] = [];
  for (let at = first; at <= window.to; at += step) slots.push(at);

  const cards = SERVICES.map(({ key, label }) => {
    const counts = new Map<number, Bucket>();

    for (const entry of entries) {
      if (entry.source !== SOURCE[key]) continue;

      const at = Math.floor(parseLogTime(entry.timestamp) / step) * step;
      const bucket = counts.get(at) ?? { at, ok: 0, warn: 0, err: 0 };
      bucket[classify(entry)]++;
      counts.set(at, bucket);
    }

    const buckets: Bucket[] = slots.map((at) => counts.get(at) ?? { at, ok: 0, warn: 0, err: 0 });

    // The bars draw the sample; the figures count the window. On a busy project those are different
    // ranges, which is why the panel says which one the bars cover.
    return { key, label, ...figures[key], buckets };
  });

  return cards.sort((a, b) => b.total - a.total);
}

/** Anything that is not a warning or an error counts as a success, as Supabase's own figure does. */
export function successRate(total: number, warn: number, err: number): number | null {
  if (total <= 0) return null;
  return 100 - ((warn + err) / total) * 100;
}
