import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  SAMPLE_LIMIT,
  SERVICES,
  SOURCE,
  asInterval,
  bucketUnit,
  buildFiguresSql,
  buildSampleSql,
  classify,
  figuresFor,
  parseLogTime,
  statusFromMessage,
  successRate,
  toCards,
  type FigureRow,
  type Figures,
  type LogEntry,
  type ServiceKey,
  windowMinutes,
} from "./logs-sql.ts";

/** The endpoint's own format: an ISO timestamp with no zone on it. */
const stamp = (ms: number) => new Date(ms).toISOString().replace("Z", "");

const entry = (source: string, ms: number, rest: Partial<LogEntry> = {}): LogEntry => ({
  source,
  timestamp: stamp(ms),
  severity_text: "LOG",
  event_message: null,
  ...rest,
});

const figures = (over: Partial<Record<ServiceKey, Figures>> = {}) =>
  ({
    ...(Object.fromEntries(SERVICES.map(({ key }) => [key, { total: 0, warn: 0, err: 0 }])) as Record<
      ServiceKey,
      Figures
    >),
    ...over,
  }) as Record<ServiceKey, Figures>;

const row = (source: string, n: number, rest: Partial<FigureRow> = {}): FigureRow => ({
  source,
  n,
  sev_err: 0,
  sev_warn: 0,
  http_err: 0,
  http_warn: 0,
  ...rest,
});

test("every statement asks about every service the cards show", () => {
  for (const sql of [buildFiguresSql(), buildSampleSql()]) {
    for (const { key } of SERVICES) assert.ok(sql.includes(`'${SOURCE[key]}'`), key);
    // The busiest source by an order of magnitude — 5570 rows of 6088 in a measured day — and no
    // card shows it.
    assert.ok(!sql.includes("pgbouncer"));
  }
});

test("no statement uses anything the endpoint refuses", () => {
  for (const sql of [buildFiguresSql(), buildSampleSql()]) {
    for (const unsupported of ["countif", "timestamp_trunc", "cast", "starts_with", "union"]) {
      assert.ok(!sql.includes(unsupported), `${unsupported} in ${sql}`);
    }
  }
});

test("the sample asks for the cap the server actually applies", () => {
  // `limit 5000`, `limit 10000` and `limit 50000` all answered with 1000 rows. Asking for more than
  // arrives is how the figures came to be drawn from a tenth of a busy window without anyone
  // noticing.
  assert.equal(SAMPLE_LIMIT, 1000);
  assert.ok(buildSampleSql().includes("limit 1000"));
  assert.ok(buildSampleSql().includes("order by timestamp desc"));
});

test("the figures are grouped rather than counted from rows", () => {
  const sql = buildFiguresSql();
  assert.ok(sql.includes("count(*) as n"));
  assert.ok(sql.includes("group by source"));
  // A `limit` here would reintroduce the cap on the one statement that escapes it.
  assert.ok(!sql.includes("limit"));
});

test("the figures carry both readings, and the severity lists cannot drift", () => {
  const sql = buildFiguresSql();
  assert.ok(sql.includes("like '% | 5__ | %'") && sql.includes("as http_err"));
  assert.ok(sql.includes("like '% | 4__ | %'") && sql.includes("as http_warn"));

  // Built from the same sets `classify` reads. Spelled out here, the two would drift apart and a
  // card would disagree with its own bars about what counts as an error.
  for (const word of ["ERROR", "FATAL", "PANIC", "CRITICAL"]) {
    assert.ok(sql.includes(`'${word}'`), word);
  }
  for (const word of ["WARNING", "WARN"]) assert.ok(sql.includes(`'${word}'`), word);
});

test("severity classification matches each source's own vocabulary", () => {
  const verdict = (source: string, severity: string) =>
    classify(entry(source, 0, { severity_text: severity }));

  assert.equal(verdict(SOURCE.postgres, "FATAL"), "err");
  assert.equal(verdict(SOURCE.postgres, "WARNING"), "warn");
  assert.equal(verdict(SOURCE.postgres, "LOG"), "ok");
  assert.equal(verdict(SOURCE.auth, "error"), "err", "GoTrue spells its levels in lower case");
  assert.equal(verdict(SOURCE.storage, "warn"), "warn");
  assert.equal(classify(entry(SOURCE.realtime, 0, { severity_text: null })), "ok");
});

test("the HTTP sources classify by status, because their severity is always INFO", () => {
  const edge = (message: string) =>
    classify(entry(SOURCE.edge, 0, { severity_text: "INFO", event_message: message }));

  assert.equal(edge("GET | 200 | 1.2.3.4 | /rest/v1/x"), "ok");
  assert.equal(edge("DELETE | 204 | 1.2.3.4 | /storage/v1/x"), "ok");
  assert.equal(edge("POST | 401 | 1.2.3.4 | /auth/v1/token"), "warn");
  assert.equal(edge("GET | 503 | 1.2.3.4 | /rest/v1/x"), "err");
  // The format is not promised, so a message that does not match counts as a success rather than
  // painting the whole card red.
  assert.equal(edge("something else entirely"), "ok");
});

test("a status is only read where one really is", () => {
  assert.equal(statusFromMessage("GET | 200 | rest"), 200);
  assert.equal(statusFromMessage(null), null);
  assert.equal(statusFromMessage("no pipes here"), null);
  assert.equal(statusFromMessage("GET | not-a-number | rest"), null);
  assert.equal(statusFromMessage("GET | 99 | rest"), null, "below any real status");
  assert.equal(statusFromMessage("GET | 600 | rest"), null, "above any real status");
  assert.equal(statusFromMessage("GET | 200.5 | rest"), null, "a status is a whole number");
});

test("a timestamp with no zone is read as UTC, not as the reader's local time", () => {
  // Read as local time in Vietnam this lands seven hours in the future, and every bucket shifts.
  assert.equal(parseLogTime("2026-09-25T12:49:33.481143"), Date.parse("2026-09-25T12:49:33.481Z"));
  assert.equal(parseLogTime("2026-09-25T12:49:33Z"), Date.parse("2026-09-25T12:49:33Z"));
  assert.equal(parseLogTime("2026-09-25T12:49:33+00:00"), Date.parse("2026-09-25T12:49:33Z"));
});

test("a severity source reads its levels and a source not answered for stays idle", () => {
  const f = figuresFor([
    row(SOURCE.postgres, 76, { sev_err: 16 }),
    row(SOURCE.storage, 98, { sev_err: 3, sev_warn: 4, http_warn: 2 }),
  ]);

  assert.deepEqual(f.postgres, { total: 76, warn: 0, err: 16 });
  // storage carries http_warn too — every row does — and it means nothing for a source that
  // reports levels. Reading it would double-count whatever its messages happen to contain.
  assert.deepEqual(f.storage, { total: 98, warn: 4, err: 3 });
  assert.deepEqual(f.realtime, { total: 0, warn: 0, err: 0 }, "an idle service still gets figures");
});

test("the HTTP sources read their statuses, never their severity", () => {
  // Every edge row is INFO, including the failures. Reading severity here would report a perfect
  // success rate for a gateway that was returning 500s.
  const f = figuresFor([
    row(SOURCE.edge, 114, { http_err: 2, http_warn: 15, sev_err: 0, sev_warn: 0 }),
    row(SOURCE.functions, 8, { http_err: 1, http_warn: 0 }),
  ]);
  assert.deepEqual(f.edge, { total: 114, warn: 15, err: 2 });
  assert.deepEqual(f.functions, { total: 8, warn: 0, err: 1 });
});

test("a source outside the cards is ignored rather than merged into one", () => {
  const f = figuresFor([row("pgbouncer_logs", 5570), row(SOURCE.auth, 120, { sev_warn: 25 })]);
  assert.deepEqual(f.auth, { total: 120, warn: 25, err: 0 });
  assert.equal(
    Object.values(f).reduce((sum, x) => sum + x.total, 0),
    120,
  );
});

const WINDOW = { from: 0, to: 60_000, unit: "minute" };

test("bars come from the sample while the figures come from the counts", () => {
  const sample = [
    ...Array.from({ length: 5 }, () => entry(SOURCE.postgres, 0)),
    ...Array.from({ length: 2 }, () => entry(SOURCE.postgres, 0, { severity_text: "WARNING" })),
    ...Array.from({ length: 3 }, () => entry(SOURCE.postgres, 0, { severity_text: "ERROR" })),
  ];
  const card = toCards(sample, WINDOW, figures({ postgres: { total: 4000, warn: 800, err: 900 } })).find(
    (c) => c.key === "postgres",
  )!;

  assert.deepEqual(card.buckets[0], { at: 0, ok: 5, warn: 2, err: 3 }, "the shape is the sample's");
  assert.equal(card.total, 4000, "the headline is the count's");
  assert.equal(card.err, 900);
});

test("a starved service reports what it did, not what fitted in the sample", () => {
  // The bug: 1000 rows shared across six sources, newest first. A chatty source takes the lot and
  // the others used to read as zero requests rather than as few.
  const card = toCards([], WINDOW, figures({ auth: { total: 120, warn: 25, err: 0 } })).find(
    (c) => c.key === "auth",
  )!;
  assert.equal(card.total, 120);
  assert.equal(card.buckets.every((b) => b.ok + b.warn + b.err === 0), true);
});

test("bar count follows the window, not how busy the project was", () => {
  // Only buckets with traffic have counts, so a quiet hour drew four fat bars across the whole card
  // while a busy one drew sixty thin ones.
  const hour = { from: 0, to: 10 * 60_000, unit: "minute" };
  const quiet = toCards([entry(SOURCE.edge, 0)], hour, figures());
  const busy = toCards(
    Array.from({ length: 11 }, (_, i) => entry(SOURCE.edge, i * 60_000)),
    hour,
    figures(),
  );
  assert.equal(quiet.find((c) => c.key === "edge")!.buckets.length, 11);
  assert.equal(busy.find((c) => c.key === "edge")!.buckets.length, 11);
});

test("a day of traffic buckets by the hour", () => {
  const day = { from: 0, to: 24 * 3_600_000, unit: "hour" };
  const card = toCards([], day, figures()).find((c) => c.key === "auth")!;
  assert.equal(card.buckets.length, 25);
});

test("a sampled row outside the drawn range does not appear in the bars", () => {
  const sample = [entry(SOURCE.auth, 0), entry(SOURCE.auth, 10 * 60_000)];
  const card = toCards(sample, WINDOW, figures({ auth: { total: 2, warn: 0, err: 0 } })).find(
    (c) => c.key === "auth",
  )!;
  assert.equal(
    card.buckets.reduce((sum, b) => sum + b.ok, 0),
    1,
  );
  assert.equal(card.total, 2, "and does not go missing from the figure either");
});

test("cards lead with the busiest service and keep the idle ones", () => {
  const cards = toCards(
    [],
    WINDOW,
    figures({
      edge: { total: 3, warn: 0, err: 0 },
      postgres: { total: 40, warn: 0, err: 4 },
    }),
  );
  assert.equal(cards.length, SERVICES.length, "every service still gets a card");
  assert.equal(cards[0].key, "postgres");
  assert.equal(cards[1].key, "edge");
  assert.equal(cards.at(-1)?.total, 0, "untouched services fall to the end at zero");
});

test("buckets arrive in time order regardless of the row order", () => {
  // The endpoint answers newest first, which is the opposite of the order the bars are drawn in.
  const sample = [entry(SOURCE.auth, 60_000), entry(SOURCE.auth, 0)];
  const card = toCards(sample, WINDOW, figures()).find((c) => c.key === "auth")!;
  assert.deepEqual(
    card.buckets.map((b) => b.at),
    [0, 60_000],
  );
});

test("success rate is undefined without traffic, not 100%", () => {
  assert.equal(successRate(0, 0, 0), null);
  assert.equal(successRate(80, 6, 0), 92.5);
  assert.equal(successRate(10, 0, 10), 0);
});

test("bucket size follows the window so the bar count stays readable", () => {
  assert.equal(bucketUnit(windowMinutes("1hr")), "minute");
  assert.equal(bucketUnit(windowMinutes("15min")), "minute");
  assert.equal(bucketUnit(windowMinutes("30min")), "minute");
  assert.equal(bucketUnit(windowMinutes("1day")), "hour");
});

test("an interval from the URL resolves, and an unknown one falls back", () => {
  // Shared by the page and the read endpoint, so the two cannot disagree about what "1hr" means.
  assert.equal(asInterval("15min"), "15min");
  assert.equal(asInterval("1day"), "1day");
  for (const bad of [null, undefined, "", "1hour", "15MIN", "; drop table", "0"]) {
    assert.equal(asInterval(bad), "1hr", `for ${JSON.stringify(bad)}`);
  }
});
