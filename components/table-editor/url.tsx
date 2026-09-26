"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

/**
 * Every control in the Table Editor changes the URL, and the URL is what the queries are keyed on.
 *
 * It is written with the history API rather than the router: the data comes from `/api/projects`
 * now, so a navigation would re-render the page on the server to produce markup that has not
 * changed. Next integrates `replaceState` with `useSearchParams`, which is what makes `editor.tsx`
 * re-read it and refetch. `replaceState`, not `pushState`, because Back should leave the table
 * editor rather than step back through every sort the user tried.
 *
 * `pending` is no longer a navigation's transition — it is whether the queries behind the grid are
 * still fetching, and it arrives from the component that runs them. One flag for all the controls,
 * as before: per-control flags dim the control that was clicked rather than the grid that is
 * actually changing.
 */
/** An array replaces every occurrence of a repeatable param, which is how filters are carried. */
type Patch = Record<string, string | string[] | null>;
type TableUrl = { set: (patch: Patch) => void; pending: boolean };

const TableUrlContext = createContext<TableUrl | null>(null);

export function TableUrlProvider({
  current,
  pending,
  children,
}: {
  /** The page's own query string, so repeated params survive a round trip through here. */
  current: string;
  /** Whether the queries keyed on this URL are still in flight. */
  pending: boolean;
  children: ReactNode;
}) {

  const set = useCallback(
    (patch: Patch) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(patch)) {
        next.delete(key);
        if (Array.isArray(value)) for (const v of value) next.append(key, v);
        else if (value !== null) next.set(key, value);
      }
      window.history.replaceState(null, "", `?${next.toString()}`);
    },
    [current],
  );

  const value = useMemo(() => ({ set, pending }), [set, pending]);
  return <TableUrlContext.Provider value={value}>{children}</TableUrlContext.Provider>;
}

export function useTableUrl(): TableUrl {
  const ctx = useContext(TableUrlContext);
  if (!ctx) throw new Error("useTableUrl must be used inside TableUrlProvider");
  return ctx;
}
