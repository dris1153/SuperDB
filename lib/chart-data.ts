/**
 * Turning an arbitrary result set into something plottable.
 *
 * This is the actual work in charting a SQL result, and none of it is what a charting library does.
 * The query endpoints return no column metadata — measured, like everything else on this page — so
 * which column is a number has to be inferred from the values, and the inference has to be right:
 * a chart built on the wrong column looks fine and means nothing, which is worse than an error.
 *
 * Numbers arrive in two shapes. `int` and `float8` come back as JSON numbers; `numeric` and `bigint`
 * come back as **strings**, because JSON cannot carry them exactly. A check for `typeof === "number"`
 * would quietly decide that every `count(*)` and every money column is text.
 */

export type Row = Record<string, unknown>;
export type Point = { label: string; value: number };

/** Beyond this a bar chart is a smear and a line chart is noise; the UI says what it cut. */
export const MAX_POINTS = 200;

/**
 * A number, or null for anything that is not one.
 *
 * Booleans are not numbers here even though JavaScript will happily add them: a column of true and
 * false plotted as 1 and 0 is a chart nobody asked for. An empty string is not zero either, which is
 * what `Number("")` would otherwise decide.
 */
export function numericValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const text = value.trim();
  // Shape-checked before parsing, because `Number()` also accepts 0x10, 0b1010 and 0o17 — none of
  // which Postgres ever emits for a number, and all of which would turn a column of hex ids or
  // colour codes into a "measurement" plotted at its base-10 value.
  if (!DECIMAL.test(text)) return null;

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Every key any row carries, in the order the first row that has each one lists it. */
export function columnsOf(rows: Row[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) seen.add(key);
  return [...seen];
}

/**
 * A column counts as numeric when it has at least one value and every value it has is a number.
 * "Mostly numeric" is not a category worth inventing: one text value in a column means the column is
 * not a measurement, and plotting it would silently drop that row.
 */
export function numericColumns(rows: Row[]): string[] {
  return columnsOf(rows).filter((key) => {
    let found = 0;
    for (const row of rows) {
      const value = row[key];
      if (value === null || value === undefined) continue;
      if (numericValue(value) === null) return false;
      found += 1;
    }
    return found > 0;
  });
}

/**
 * What to plot before anyone chooses anything.
 *
 * The first non-numeric column is the category and the last numeric one is the value, which is the
 * shape of nearly every `group by` — a name and a count at the end. When every column is numeric the
 * first is still offered as the category, because a year or an id is a perfectly good axis.
 */
export function defaultChoice(rows: Row[]): { x: string | null; y: string | null } {
  const columns = columnsOf(rows);
  const numeric = new Set(numericColumns(rows));

  const x = columns.find((c) => !numeric.has(c)) ?? columns[0] ?? null;
  // The *last* numeric column, not the first: a group by puts its aggregate at the end, and a
  // select * puts the primary key at the front. Picking the first would chart ids by name for the
  // most ordinary query anyone runs.
  const y =
    columns.findLast((c) => numeric.has(c) && c !== x) ??
    columns.findLast((c) => numeric.has(c)) ??
    null;

  return { x, y };
}

/** Null when there is something to chart; otherwise the reason, in words a reader can act on. */
export function chartProblem(rows: Row[]): string | null {
  if (rows.length === 0) return "No rows to chart.";
  if (numericColumns(rows).length === 0) {
    return "No numeric column in this result. A chart needs something to measure.";
  }
  return null;
}

/**
 * The points, in row order — never sorted. The statement's `order by` is the author's answer to what
 * order this is in, and re-sorting here would quietly disagree with the grid beside it.
 *
 * Rows whose value is not a number are dropped rather than treated as zero: a gap is honest, a zero
 * is a measurement nobody took. The count of those is returned so the UI can say so.
 */
export function buildPoints(
  rows: Row[],
  x: string,
  y: string,
  /** Chosen once for the whole column by `labelFormatter`; defaults to plain text. */
  format: (value: unknown) => string = labelOf,
): { points: Point[]; skipped: number } {
  const points: Point[] = [];
  let skipped = 0;

  for (const row of rows.slice(0, MAX_POINTS)) {
    const value = numericValue(row[y]);
    if (value === null) {
      skipped += 1;
      continue;
    }
    points.push({ label: format(row[x]), value });
  }

  return { points, skipped };
}

/** Nulls keep their own label rather than becoming an empty tick nobody can identify. */
function labelOf(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * The vertical scale, which always includes zero.
 *
 * A bar chart with a floating baseline exaggerates every difference on it, which is the oldest way
 * for a chart to lie by accident. The degenerate case is a result where everything is zero — an
 * empty count, a group by over nothing. Left alone the span is zero, and dividing by it puts the
 * baseline at the *top* of the frame with a one-pixel bar hanging from it, which reads as a large
 * value for a result that is entirely zero. So an all-zero result gets a 0..1 scale.
 *
 * Ticks are deduplicated: a scale whose midpoint equals an end would otherwise print the same
 * number twice and claim a value the data does not contain.
 */
export function scaleOf(points: Point[]): { top: number; bottom: number; ticks: number[] } {
  const values = points.map((p) => p.value);
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);

  if (top === bottom) return { top: 1, bottom: 0, ticks: [1, 0.5, 0] };

  const middle = (top + bottom) / 2;
  return { top, bottom, ticks: [...new Set([top, middle, bottom])] };
}

/**
 * A running total. The chart offers it because the original does, and the legend says so when it is
 * on — a cumulative series is a different measurement from the one the query returned, and reading
 * one as the other is the failure this whole module exists to avoid.
 */
export function cumulative(points: Point[]): Point[] {
  let total = 0;
  return points.map((point) => {
    total += point.value;
    return { ...point, value: total };
  });
}

/**
 * How the category axis is written, decided **once for the whole column**.
 *
 * A timestamp column stringifies to `2026-09-01T04:00:00+00:00` — twenty-five characters that have
 * to be rotated and truncated to fit, which is most of what made this chart hard to read. Formatted
 * it is `Sep 1 2026 04:00`, which sits flat under the bar.
 *
 * Per column, never per value: one unparseable value among timestamps means the column is not a
 * time series, and an axis that is half dates and half raw strings is an axis that lies about what
 * it is showing.
 */
export function labelFormatter(rows: Row[], column: string): (value: unknown) => string {
  return isTimestampColumn(rows, column) ? formatTimestamp : labelOf;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]|$)/;
const HAS_TIME = /^\d{4}-\d{2}-\d{2}[T ]/;
const ZONED = /(Z|[+-]\d{2}(:?\d{2})?)$/i;

/**
 * A timestamp with no zone on it is a wall clock, and has to be read as one.
 *
 * Measured against the query endpoint 2026-09-14: `timestamptz` comes back as
 * `2026-09-14 16:55:59.660151+00`, but `timestamp` and anything cast with `::text` come back as
 * `2026-09-14 16:55:59.660151` with nothing on the end. `Date.parse` reads that second form in the
 * *browser's* zone, and formatting the result back in UTC then moves it — seven hours, and a day,
 * on the machine this was measured on. Stamping a Z on it keeps the clock the database wrote.
 */
const asUtc = (text: string) =>
  !HAS_TIME.test(text) || ZONED.test(text) ? text : `${text.replace(" ", "T")}Z`;

function isTimestampColumn(rows: Row[], column: string): boolean {
  let found = 0;
  for (const row of rows) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    // The shape check comes first: Date.parse accepts "12" and a pile of other things that are not
    // timestamps, and a column of short numeric ids would otherwise become a date axis.
    if (
      typeof value !== "string" ||
      !ISO_DATE.test(value.trim()) ||
      !Number.isFinite(Date.parse(asUtc(value.trim())))
    ) {
      return false;
    }
    found += 1;
  }
  return found > 0;
}

/** UTC, like the running-queries panel: the API returns UTC and guessing a zone would be worse. */
// en-US, not en-GB: the latter abbreviates September to "Sept", which is a character wider than
// every other month and makes the axis jump.
const TIMESTAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatTimestamp(value: unknown): string {
  const parsed = typeof value === "string" ? Date.parse(asUtc(value.trim())) : NaN;
  if (!Number.isFinite(parsed)) return labelOf(value);

  const parts = Object.fromEntries(
    TIMESTAMP.formatToParts(new Date(parsed)).map((part) => [part.type, part.value]),
  );
  return `${parts.month} ${parts.day} ${parts.year} ${parts.hour}:${parts.minute}`;
}

