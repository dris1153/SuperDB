"use client";

import { createContext, useCallback, useContext, useMemo, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Every control in the Table Editor changes the URL and lets the server refetch — the same trade
 * `interval-picker.tsx` makes. There is no `loading.tsx` anywhere in this app, so without a pending
 * flag an RSC navigation just freezes the page for a few hundred milliseconds.
 *
 * One transition is shared by all of them on purpose. Per-component transitions only report on the
 * control that was clicked, so paging forward would dim the footer while the grid — the only part
 * actually changing — sat opaque showing stale rows.
 *
 * Current values arrive as props from the server rather than through `useSearchParams`, which keeps
 * these components out of the Suspense requirement that hook carries.
 */
/** An array replaces every occurrence of a repeatable param, which is how filters are carried. */
type Patch = Record<string, string | string[] | null>;
type TableUrl = { set: (patch: Patch) => void; pending: boolean };

const TableUrlContext = createContext<TableUrl | null>(null);

export function TableUrlProvider({
  current,
  children,
}: {
  /** The page's own query string, so repeated params survive a round trip through here. */
  current: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const set = useCallback(
    (patch: Patch) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) {
        next.delete(key);
        if (Array.isArray(value)) for (const v of value) next.append(key, v);
        else if (value !== null) next.set(key, value);
      }
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    },
    [current, pathname, router],
  );

  const value = useMemo(() => ({ set, pending }), [set, pending]);
  return <TableUrlContext.Provider value={value}>{children}</TableUrlContext.Provider>;
}

export function useTableUrl(): TableUrl {
  const ctx = useContext(TableUrlContext);
  if (!ctx) throw new Error("useTableUrl must be used inside TableUrlProvider");
  return ctx;
}
