"use client";

import { useState, useTransition } from "react";
import type { SavedQuery } from "@/lib/saved-queries";
import { patchQuery, removeQuery, saveQuery, type QueryListResult } from "@/lib/sql-editor-actions";
import {
  isWaiting,
  reasonOf,
  useProjectPart,
  useRefetchPart,
  useSetPart,
} from "@/components/use-project-part";

/**
 * The saved-query list and the four things that change it.
 *
 * Every action answers with the whole list, so there is no patch to apply and no optimistic state to
 * roll back — the list is small, and the server's answer is the only version worth rendering. The
 * ordering is the server's too (most recently changed first), which a local edit would get wrong.
 *
 * A failure leaves the previous list on screen and reports itself; the callback only runs on
 * success, so a dialog stays open with its error rather than closing as though it had worked.
 *
 * The list comes from the read endpoint like every other part, and each mutation writes its answer
 * straight into the cache: the server has just said what the list is, and asking again would be
 * asking it to repeat itself.
 */
export function useSavedQueries(projectRef: string) {
  const state = useProjectPart<SavedQuery[]>(projectRef, "saved-queries");
  const setQueries = useSetPart<SavedQuery[]>(projectRef, "saved-queries");
  const refetch = useRefetchPart(projectRef, "saved-queries");

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const queries = state.status === "ready" && Array.isArray(state.data) ? state.data : [];

  /**
   * Two refusals mean "the list you are holding is out of date": the row was renamed or deleted
   * somewhere else. Reporting them without re-reading leaves the stale row on screen, where the
   * next click fails the same way — and nothing would refetch it for a full stale window.
   */
  const report = (reason: string) => {
    setError(reason);
    if (/no longer exists|already gone/i.test(reason)) void refetch();
  };

  /**
   * Every action answers with the whole list and may answer with a refusal, so they all run the same
   * way; `then` receives the successful answer, which is how `create` gets the id only the server
   * knows. The write is awaited before it, so the callback sees the list it was given.
   */
  const act = <R extends QueryListResult>(
    run: () => Promise<R>,
    then?: (ok: Extract<R, { ok: true }>) => void,
  ) =>
    startTransition(async () => {
      // Cleared on the way in: the message is shared with the dialogs, so a failed favourite toggle
      // would otherwise turn up inside the next delete confirmation.
      setError(null);
      try {
        const result = await run();
        if (!result.ok) return report(result.reason);
        await setQueries(result.queries);
        then?.(result as Extract<R, { ok: true }>);
      } catch {
        // The action itself was rejected — an expired session, or the network.
        setError("Could not reach the server.");
      }
    });

  return {
    queries,
    /** Loading is not emptiness: the sidebar has to tell "nothing saved" from "could not be read". */
    loading: isWaiting(state),
    unavailable: reasonOf(state),
    error,
    pending,
    /** `onSaved` receives the new id, which only the server knows. */
    create: (name: string, sql: string, onSaved: (id: string) => void) =>
      act(() => saveQuery(projectRef, name, sql), (ok) => onSaved(ok.id)),
    update: (id: string, patch: { name?: string; sql?: string; favorite?: boolean }, then?: () => void) =>
      act(() => patchQuery(projectRef, id, patch), then),
    remove: (id: string, then?: () => void) => act(() => removeQuery(projectRef, id), then),
    dismissError: () => setError(null),
  };
}
