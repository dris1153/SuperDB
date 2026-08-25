/**
 * Minimal reader for the Prometheus exposition format that
 * `/v1/projects/{ref}/analytics/endpoints/metrics` returns.
 *
 * Not a general parser — it pulls single gauge values by name, which is all the Overview needs.
 * Lines look like:
 *
 *   # HELP node_memory_MemTotal_bytes Memory information
 *   # TYPE node_memory_MemTotal_bytes gauge
 *   node_memory_MemTotal_bytes{supabase_project_ref="abc"} 1.03428096e+09
 */

export type Sample = { name: string; labels: Record<string, string>; value: number };

const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([^\s]+)(?:\s+\d+)?$/;

function parseLabels(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const labels: Record<string, string> = {};
  // Values may contain commas and escaped quotes, so match pairs rather than splitting on commas.
  for (const [, key, value] of raw.slice(1, -1).matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g)) {
    labels[key] = value.replace(/\\(.)/g, "$1");
  }
  return labels;
}

export function parseMetrics(text: string): Sample[] {
  const samples: Sample[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = LINE.exec(trimmed);
    if (!match) continue;

    // NaN, +Inf and -Inf are all legal here and none of them are worth charting.
    const value = Number(match[3]);
    if (!Number.isFinite(value)) continue;

    samples.push({ name: match[1], labels: parseLabels(match[2]), value });
  }
  return samples;
}

/** First sample matching a name, optionally narrowed by labels. */
export function findMetric(
  samples: Sample[],
  name: string,
  labels: Record<string, string> = {},
): number | null {
  const hit = samples.find(
    (s) => s.name === name && Object.entries(labels).every(([k, v]) => s.labels[k] === v),
  );
  return hit ? hit.value : null;
}

export function sumMetric(samples: Sample[], name: string): number | null {
  const matching = samples.filter((s) => s.name === name);
  return matching.length > 0 ? matching.reduce((total, s) => total + s.value, 0) : null;
}

/**
 * Memory used as a percentage, derived the way node_exporter intends: total minus available, rather
 * than total minus free, which ignores reclaimable cache and reads far too high.
 */
export function memoryUsedPercent(samples: Sample[]): number | null {
  const total = findMetric(samples, "node_memory_MemTotal_bytes");
  const available = findMetric(samples, "node_memory_MemAvailable_bytes");
  if (total === null || available === null || total <= 0) return null;
  return Math.round(((total - available) / total) * 100);
}
