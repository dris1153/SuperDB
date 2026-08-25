/**
 * The 3×3 dot grid the Supabase dashboard uses for the status tile, tinted by health rather than
 * sitting next to a separate badge.
 */
const TONE: Record<string, string> = {
  ACTIVE_HEALTHY: "bg-primary",
  ACTIVE_UNHEALTHY: "bg-destructive",
  INIT_FAILED: "bg-destructive",
  RESTORE_FAILED: "bg-destructive",
  PAUSE_FAILED: "bg-destructive",
  INACTIVE: "bg-subtle",
  REMOVED: "bg-subtle",
};

export function StatusDots({ status }: { status: string }) {
  // Anything mid-transition falls through to the warning tone.
  const tone = TONE[status] ?? "bg-warn";

  return (
    <span className="grid grid-cols-3 gap-[3px]" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={`size-1 rounded-full ${tone}`} />
      ))}
    </span>
  );
}
