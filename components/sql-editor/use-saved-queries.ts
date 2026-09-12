"use client";

import { useState, useTransition } from "react";
import type { SavedQuery } from "@/lib/saved-queries";
import { patchQuery, removeQuery, saveQuery, type QueryListResult } from "@/lib/sql-editor-actions";

/**
 * The saved-query list and the four things that change it.
 *
 * Every action answers with the whole list, so there is no patch to apply and no optimistic state to
 * roll back — the list is small, and the server's answer is the only version worth rendering. The
 * ordering is the server's too (most recently changed first), which a local edit would get wrong.
 *
 * A failure leaves the previous list on screen and reports itself; the callback only runs on
 * success, so a dialog stays open with its error rather than closing as though it had worked.
 */
export function useSavedQueries(projectRef: string, initial: SavedQuery[]) {
  const [queries, setQueries] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (run: () => Promise<QueryListResult>, then?: () => void) =>
    startTransition(async () => {
      // Cleared on the way in: the message is shared with the dialogs, so a failed favourite toggle
      // would otherwise turn up inside the next delete confirmation.
      setError(null);
      try {
        const result = await run();
        if (!result.ok) return setError(result.reason);
        setQueries(result.queries);
        then?.();
      } catch {
        // The action itself was rejected — an expired session, or the network.
        setError("Could not reach the server.");
      }
    });

  return {
    queries,
    error,
    pending,
    /** `onSaved` receives the new id, which only the server knows. */
    create: (name: string, sql: string, onSaved: (id: string) => void) =>
      startTransition(async () => {
        setError(null);
        try {
          const result = await saveQuery(projectRef, name, sql);
          if (!result.ok) return setError(result.reason);
          setQueries(result.queries);
          onSaved(result.id);
        } catch {
          setError("Could not reach the server.");
        }
      }),
    update: (id: string, patch: { name?: string; sql?: string; favorite?: boolean }, then?: () => void) =>
      act(() => patchQuery(projectRef, id, patch), then),
    remove: (id: string, then?: () => void) => act(() => removeQuery(projectRef, id), then),
    dismissError: () => setError(null),
  };
}
