import type { ComponentProps, ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const BUTTON = {
  // Dark label on the green fill: DESIGN.md specifies #fafafa, but white on #3ecf8e is ~1.7:1
  // contrast. The canvas color reads at ~10:1 and keeps the button legible.
  primary: "bg-brand text-canvas border-brand hover:bg-brand-text hover:border-brand-border",
  ghost: "bg-transparent text-fg border-line-strong hover:bg-white/5 hover:border-graphite",
  danger: "bg-transparent text-danger border-line-strong hover:bg-danger/10 hover:border-danger/50",
} as const;

export function Button({
  variant = "ghost",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof BUTTON }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand",
        "disabled:opacity-50",
        BUTTON[variant],
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-md border border-line-strong bg-canvas px-3 py-1.5 text-sm text-fg",
        "placeholder:text-fg-subtle focus:border-brand focus:outline-none",
        className,
      )}
    />
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} className={cx("rounded-lg border border-line bg-panel", className)} />;
}

const TONE = {
  neutral: "border-line-strong text-fg-muted",
  brand: "border-brand-border text-brand",
  warn: "border-warn/40 text-warn",
  danger: "border-danger/40 text-danger",
} as const;

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof TONE;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-fg-subtle">{label}</div>
      <div className="mt-1 text-2xl font-normal tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-fg-subtle">{hint}</div> : null}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-12 text-center text-sm text-fg-subtle">
      {children}
    </div>
  );
}
