import { cn } from "@/lib/utils";

/**
 * The loading placeholder.
 *
 * `aria-hidden` because it says nothing: a screen reader announcing a row of blank boxes is worse
 * than silence, and the components around it already say what is being waited for.
 *
 * Reduced motion and the sweep both live in the `skeleton` utility in `globals.css`, so a call site
 * cannot forget either — four of them had. A placeholder standing in for a bordered surface passes
 * `border border-border` rather than reaching for a variant: one look by default, an opt-in for the
 * two places that replace a card.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

/**
 * A placeholder for a grid: ruled rows that fill whatever height they are handed.
 *
 * `rowHeight` comes from the grid being waited for, so the rules land where its rows will. The
 * stripes are one repeating gradient rather than N elements — the old version was a flat block of a
 * fixed height, which then jumped when a grid sized to the viewport replaced it.
 */
export function SkeletonRows({ rowHeight, className }: { rowHeight: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("skeleton-rows", className)}
      style={{ "--row": `${rowHeight}px` } as React.CSSProperties}
    />
  );
}
