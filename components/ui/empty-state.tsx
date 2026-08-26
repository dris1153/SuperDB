import type { ReactNode } from "react";

/** No shadcn equivalent — the dashed placeholder used when a list has nothing in it. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-subtle">
      {children}
    </div>
  );
}
