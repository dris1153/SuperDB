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
export function buildPoints(rows: Row[], x: string, y: string): { points: Point[]; skipped: number } {
  const points: Point[] = [];
  let skipped = 0;

  for (const row of rows.slice(0, MAX_POINTS)) {
    const value = numericValue(row[y]);
    if (value === null) {
      skipped += 1;
      continue;
    }
    points.push({ label: labelOf(row[x]), value });
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
