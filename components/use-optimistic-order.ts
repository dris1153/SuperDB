"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * The ordering state machine behind both reorderable surfaces: the connections table and the board's
 * project grid.
 *
 * Shared rather than copied because two of the three things it does were defects first. Writing them
 * a second time by hand would very likely reproduce both:
 *
 *  - the render-phase sync is gated on `pending`, or a revalidation landing mid-write undoes the
 *    order on screen and the next click computes from a stale list, silently swallowing a move;
 *  - a failed write re-fetches instead of restoring a snapshot, because anything held on the client
 *    may itself be an optimistic order that was never stored.
 *
 * Deliberately owns no DOM and no drag wiring. A vertical table and a horizontal grid differ exactly
 * there, and folding them together would need a `variant` prop — the abstraction worth not building.
 */
export function useOptimisticOrder<T extends { id: string }>(
  incoming: T[],
  write: (ids: string[]) => Promise<void>,
) {
  const [rows, setRows] = useState(incoming);
  const [seen, setSeen] = useState(incoming);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  // Callers rebuild this array on every render, so the identity always differs and this runs every
  // time. Taking the server's order while a write is still in flight would undo it on screen and
  // make the next click compute from a stale list, so it only applies once nothing is pending.
  if (incoming !== seen) {
    setSeen(incoming);
    if (!pending) {
      setRows(incoming);
      setError(null);
    }
  }

  function commit(next: T[]) {
    if (next.every((row, i) => row.id === rows[i]?.id)) return;

    setRows(next);
    setError(null);
    start(async () => {
      try {
        await write(next.map((row) => row.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the new order");
        // Ask the server rather than restoring a snapshot: after a failed write, anything held on
        // the client may itself be an optimistic order that was never stored.
        router.refresh();
      }
    });
  }

  /** Swaps one row with its neighbour. The keyboard path; drag goes through commit directly. */
  function move(id: string, delta: number) {
    const from = rows.findIndex((row) => row.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= rows.length) return;

    const next = [...rows];
    [next[from], next[to]] = [next[to], next[from]];
    commit(next);
  }

  return { rows, commit, move, pending, error };
}
