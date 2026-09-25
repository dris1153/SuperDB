export function bytes(n: number | null | undefined): string {
  if (n == null) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function count(n: number | null | undefined): string {
  if (n == null || n < 0) return "—";
  return new Intl.NumberFormat("en-US", { notation: n >= 10000 ? "compact" : "standard" }).format(n);
}

export function date(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-CA");
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["day", 86_400],
  ["hour", 3600],
  ["minute", 60],
];

/**
 * "16 days ago", for a timestamp whose exact moment matters less than its distance.
 *
 * Anything under a minute reads "just now" rather than "0 seconds ago", and a time slightly in the
 * future — clock skew between this machine and Supabase's — reads the same rather than "in 3
 * seconds". Further ahead than that is not skew, it is a value that cannot be trusted, and it gets
 * the same dash as no value at all.
 */
const SKEW_SECONDS = 300;

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "\u2014";

  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(seconds) || seconds < -SKEW_SECONDS) return "\u2014";
  if (seconds < 60) return "just now";

  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return format.format(-Math.floor(seconds / size), unit);
  }

  return "just now";
}
