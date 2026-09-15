import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SERVICES, asInterval, bucketUnit, buildServiceLogsSql, successRate, toCards, type LogRow, windowMinutes } from "./logs-sql.ts";

const MICRO = 1_000; // Logflare reports microseconds; a JS millisecond is 1000 of them.

test("the statement covers every service in one union", () => {
  const sql = buildServiceLogsSql("hour");
  for (const { key } of SERVICES) assert.ok(sql.includes(`"${key}" as service`), key);
  // Six branches joined by five unions: one request, not six.
  assert.equal(sql.split("union all").length, 6);
});

test("severity classification matches each source's own vocabulary", () => {
  const sql = buildServiceLogsSql("minute");
  assert.ok(sql.includes("r.status_code >= 500"), "HTTP sources classify by status");
  assert.ok(sql.includes(`pr.error_severity in ("ERROR","FATAL","PANIC")`), "postgres by severity");
  assert.ok(sql.includes(`m.level = "error"`), "the rest by log level");
});

const WINDOW = { from: 0, to: 60_000, unit: "minute" };

test("successes are whatever is left after warnings and errors", () => {
  const rows: LogRow[] = [{ service: "postgres", bucket: 0, total: 10, warn: 2, err: 3 }];
  const card = toCards(rows, WINDOW).find((c) => c.key === "postgres")!;
  assert.deepEqual(card.buckets[0], { at: 0, ok: 5, warn: 2, err: 3 });
});

test("bar count follows the window, not how busy the project was", () => {
  // The bug this guards: the query returns only buckets with traffic, so a quiet hour drew four
  // fat bars across the whole card while a busy one drew sixty thin ones.
  const hour = { from: 0, to: 10 * 60_000, unit: "minute" };
  const quiet = toCards([{ service: "edge", bucket: 0, total: 1, warn: 0, err: 0 }], hour);
  const busy = toCards(
    Array.from({ length: 11 }, (_, i) => ({
      service: "edge",
      bucket: i * 60_000 * MICRO,
      total: 1,
      warn: 0,
      err: 0,
    })),
    hour,
  );
  assert.equal(quiet.find((c) => c.key === "edge")!.buckets.length, 11);
  assert.equal(busy.find((c) => c.key === "edge")!.buckets.length, 11);
});

test("a day of traffic buckets by the hour", () => {
  const day = { from: 0, to: 24 * 3_600_000, unit: "hour" };
  const card = toCards([], day).find((c) => c.key === "auth")!;
  assert.equal(card.buckets.length, 25);
});

test("cards lead with the busiest service and keep the idle ones", () => {
  const rows: LogRow[] = [
    { service: "edge", bucket: 0, total: 3, warn: 0, err: 0 },
    { service: "postgres", bucket: 0, total: 40, warn: 0, err: 4 },
  ];
  const cards = toCards(rows, WINDOW);
  assert.equal(cards.length, SERVICES.length, "every service still gets a card");
  assert.equal(cards[0].key, "postgres");
  assert.equal(cards[1].key, "edge");
  assert.equal(cards.at(-1)?.total, 0, "untouched services fall to the end at zero");
});

test("buckets arrive in time order regardless of the row order", () => {
  const rows: LogRow[] = [
    { service: "auth", bucket: 60_000 * MICRO, total: 1, warn: 0, err: 0 },
    { service: "auth", bucket: 0, total: 1, warn: 0, err: 0 },
  ];
  const card = toCards(rows, { from: 0, to: 60_000, unit: "minute" }).find((c) => c.key === "auth")!;
  // Slots are generated in order, so the filled series is sorted whatever order the rows arrived in.
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
