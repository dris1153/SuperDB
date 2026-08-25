import { AU, BR, CA, CH, DE, FR, GB, HK, IE, IN, JP, KR, SE, SG, US } from "country-flag-icons/react/3x2";

/**
 * Real SVG flags rather than emoji.
 *
 * Emoji flags are regional-indicator pairs, and Windows ships no font that renders them — Chrome
 * there falls back to drawing the two letters, so "🇦🇺" appears as "AU". That is a platform gap with
 * no CSS fix; the only reliable option is shipping the artwork.
 *
 * Imported by name from a barrel that is pure re-exports, so only the fifteen countries Supabase
 * actually has regions in reach the bundle.
 */
const FLAGS = { AU, BR, CA, CH, DE, FR, GB, HK, IE, IN, JP, KR, SE, SG, US } as const;

export function RegionFlag({ country, className }: { country: string | null; className?: string }) {
  if (!country) return null;
  const Flag = FLAGS[country as keyof typeof FLAGS];
  if (!Flag) return null;

  return <Flag title={country} className={className ?? "h-4 w-6 rounded-[2px]"} />;
}
