import assert from "node:assert/strict";
import test from "node:test";
import { findMetric, memoryUsedPercent, parseMetrics, sumMetric } from "./prometheus.ts";

const SAMPLE = `
# HELP node_memory_MemTotal_bytes Memory information field MemTotal_bytes.
# TYPE node_memory_MemTotal_bytes gauge
node_memory_MemTotal_bytes{supabase_project_ref="abcdefghijklmnopqrst"} 1.03428096e+09
node_memory_MemAvailable_bytes{supabase_project_ref="abcdefghijklmnopqrst"} 5.1714048e+08
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 12345.67
node_cpu_seconds_total{cpu="1",mode="idle"} 54321.33
pg_stat_database_num_backends{datname="postgres"} 11
metric_with_timestamp 42 1699999999000
broken line without value
gauge_nan NaN
gauge_inf +Inf
`;

test("skips comments, blank lines and malformed rows", () => {
  const names = parseMetrics(SAMPLE).map((s) => s.name);
  assert.ok(!names.includes("broken"));
  assert.ok(names.includes("node_memory_MemTotal_bytes"));
});

test("reads scientific notation", () => {
  assert.equal(findMetric(parseMetrics(SAMPLE), "node_memory_MemTotal_bytes"), 1.03428096e9);
});

test("parses labels and narrows by them", () => {
  const samples = parseMetrics(SAMPLE);
  assert.equal(findMetric(samples, "node_cpu_seconds_total", { cpu: "1" }), 54321.33);
  assert.equal(findMetric(samples, "node_cpu_seconds_total", { cpu: "0" }), 12345.67);
});

test("returns null for a metric that is absent", () => {
  assert.equal(findMetric(parseMetrics(SAMPLE), "not_present"), null);
});

test("ignores a trailing timestamp column", () => {
  assert.equal(findMetric(parseMetrics(SAMPLE), "metric_with_timestamp"), 42);
});

test("drops NaN and infinities rather than charting them", () => {
  const names = parseMetrics(SAMPLE).map((s) => s.name);
  assert.ok(!names.includes("gauge_nan"));
  assert.ok(!names.includes("gauge_inf"));
});

test("sums every series sharing a name", () => {
  assert.equal(sumMetric(parseMetrics(SAMPLE), "node_cpu_seconds_total"), 12345.67 + 54321.33);
  assert.equal(sumMetric(parseMetrics(SAMPLE), "not_present"), null);
});

test("memory percentage uses available, not free", () => {
  // 1.034GB total, 0.517GB available → 50% used.
  assert.equal(memoryUsedPercent(parseMetrics(SAMPLE)), 50);
});

test("memory percentage is null when either side is missing", () => {
  assert.equal(memoryUsedPercent(parseMetrics("node_memory_MemTotal_bytes 100")), null);
});
