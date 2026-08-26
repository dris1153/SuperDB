"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import { Loader2Icon } from "lucide-react";

/**
 * A filled rounded square with the glyph knocked out to the toast's own surface — measured off
 * Supabase's toast, which uses a badge rather than the outline icon shadcn ships. Drawn here instead
 * of borrowed from lucide: it has no filled square-with-exclamation, and bending fill and stroke
 * into that shape is more code than the two paths below.
 */
function Badge({ tone, glyph }: { tone: string; glyph: "alert" | "check" }) {
  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center rounded-[5px]"
      style={{ backgroundColor: tone }}
    >
      <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden>
        {glyph === "alert" ? (
          <path
            d="M6 2.5v4M6 9h.01"
            stroke="var(--toast-knockout)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        ) : (
          <path
            d="M2.6 6.2 4.9 8.5 9.4 3.9"
            stroke="var(--toast-knockout)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </span>
  );
}

// Dark-only app: no theme provider to read from, so the theme is fixed rather than pulled from
// next-themes.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      richColors
      className="toaster group"
      icons={{
        success: <Badge tone="var(--color-primary)" glyph="check" />,
        error: <Badge tone="var(--color-toast-error-icon)" glyph="alert" />,
        warning: <Badge tone="var(--color-warn)" glyph="alert" />,
        info: <Badge tone="var(--color-muted-foreground)" glyph="alert" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      duration={100000}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",

          // richColors tints the whole surface by severity; these replace sonner's own palette.
          "--error-bg": "var(--color-toast-error-bg)",
          "--error-border": "var(--color-toast-error-border)",
          "--error-text": "var(--foreground)",
          "--success-bg": "var(--color-toast-success-bg)",
          "--success-border": "var(--color-brand-border)",
          "--success-text": "var(--foreground)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // The knockout has to match whichever surface the toast ended up with, so each variant
          // hands its own background down to the glyph.
          toast: "cn-toast [--toast-knockout:var(--popover)]",
          error: "[--toast-knockout:var(--color-toast-error-bg)]",
          success: "[--toast-knockout:var(--color-toast-success-bg)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
