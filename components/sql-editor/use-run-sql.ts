"use client";

import { useState, useTransition } from "react";
import { runSql, type RunResult } from "@/lib/sql-editor-actions";

/**
 * Running the active tab's statement, and the one confirm in between.
 *
 * Every run goes to a read-only transaction first. Postgres answers whether it writes — a client
 * cannot tell, since a function call can write and so can a CTE — so a read is never interrupted
 * and a write is confirmed exactly once. The refused attempt rolls back and changes nothing.
 *
 * Everything here is per tab: the result, and which tab is running. One shared panel would show
 * tab A's rows under tab B, and a result read against the wrong statement is how the wrong thing
 * gets run. Tabs stay switchable while a statement is in flight, so every path carries its tab.
 */
export function useRunSql(projectRef: string, activeId: string) {
  const [results, setResults] = useState<Record<string, RunResult | null>>({});
  /**
   * The statement Postgres refused and the tab that asked for it, held until the user answers —
   * neither read back off the editor. The editor stays typeable during a run, so re-reading would
   * send a statement no read-only transaction ever vetted while the dialog claimed otherwise, and
   * re-reading the active tab would file the outcome of a write under whichever tab is on screen
   * when the dialog is answered.
   */
  const [confirming, setConfirming] = useState<{ tabId: string; sql: string } | null>(null);
  const [runningTab, setRunningTab] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const show = (tabId: string, next: RunResult | null) =>
    setResults((all) => ({ ...all, [tabId]: next }));

  const run = (statement: string, confirmed: boolean, tabId = activeId) => {
    if (statement.trim() === "" || runningTab !== null) return;
    setRunningTab(tabId);

    startTransition(async () => {
      try {
        const next = await runSql(projectRef, statement, confirmed);
        if (next.status === "needs-confirmation") {
          // The old rows go with it: leaving them up under an unanswered dialog reads as though the
          // statement had run.
          show(tabId, null);
          setConfirming({ tabId, sql: statement });
          return;
        }
        setConfirming(null);
        show(tabId, next);
      } catch (error) {
        // A rejected action — an expired session, an unreachable database — would otherwise leave
        // the page exactly as it was, with nothing to say whether a write had happened.
        setConfirming(null);
        show(tabId, {
          status: "error",
          error: {
            sqlstate: null,
            text: error instanceof Error ? error.message : "The request failed.",
            line: null,
            column: null,
          },
        });
      } finally {
        // Including the needs-confirmation path: the question is the user's to answer, and the
        // editor must not be locked while they read it.
        setRunningTab(null);
      }
    });
  };

  return {
    result: results[activeId] ?? null,
    confirming,
    /** Only the tab that asked is busy; the others stay usable. */
    running: runningTab === activeId,
    busy: runningTab !== null,
    run,
    cancelConfirm: () => setConfirming(null),
    /** A closed tab's rows can be several megabytes, and nothing will ask for them again. */
    forget: (tabId: string) =>
      setResults((all) => {
        if (!(tabId in all)) return all;
        const { [tabId]: _gone, ...rest } = all;
        return rest;
      }),
  };
}
