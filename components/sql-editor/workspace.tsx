"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import { runSql, type RunResult } from "@/lib/sql-editor-actions";
import { Button } from "@/components/ui/button";
import { Results } from "./results";
import { RunConfirm } from "./run-confirm";

// Route-scoped on purpose: CodeMirror is the largest thing on this page, and an entire plan exists
// about this app's latency. `ssr: false` because the editor needs a DOM element to attach to.
const SqlCodeEditor = dynamic(() => import("./editor"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-muted/20" />,
});

/**
 * The page's state: the statement, what came back, and the one confirm in between.
 *
 * Every run goes to a read-only transaction first. Postgres answers whether it writes — a client
 * cannot tell, since a function call can write and so can a CTE — so a read is never interrupted
 * and a write is confirmed exactly once. The refused attempt rolls back and changes nothing.
 */
export function SqlWorkspace({
  projectRef,
  projectName,
}: {
  projectRef: string;
  projectName: string;
}) {
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  /**
   * The statement Postgres refused, held until the user answers — not read back off the editor.
   * The editor stays typeable during a run, so re-reading it here would send a statement that no
   * read-only transaction ever vetted, while the dialog claimed otherwise.
   */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (statement: string, confirmed: boolean) => {
    if (statement.trim() === "" || pending) return;

    startTransition(async () => {
      try {
        const next = await runSql(projectRef, statement, confirmed);
        if (next.status === "needs-confirmation") {
          // The old rows go with it: leaving them up under an unanswered dialog reads as though the
          // statement had run.
          setResult(null);
          setConfirming(statement);
          return;
        }
        setConfirming(null);
        setResult(next);
      } catch (error) {
        // A rejected action — an expired session, an unreachable database — would otherwise leave
        // the page exactly as it was, with nothing to say whether a write had happened.
        setConfirming(null);
        setResult({
          status: "error",
          error: {
            sqlstate: null,
            text: error instanceof Error ? error.message : "The request failed.",
            line: null,
            column: null,
          },
        });
      }
    });
  };

  return (
    <div className="flex h-screen min-w-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button size="sm" onClick={() => run(sql, false)} disabled={pending || sql.trim() === ""}>
          <IconPlayerPlayFilled size={12} stroke={1.5} />
          {pending ? "Running…" : "Run"}
        </Button>
        <span className="text-[11px] text-subtle">Ctrl/Cmd + Enter</span>
      </div>

      <div className="h-[45%] min-h-0 border-b border-border">
        {/* The document is sent untrimmed. Postgres counts `LINE n` from what it was given, so
            trimming here would shift every error position the editor underlines. */}
        <SqlCodeEditor
          initialValue={sql}
          onChange={setSql}
          onRun={() => run(sql, false)}
          error={result?.status === "error" ? result.error : null}
        />
      </div>

      <div className="min-h-0 flex-1">
        <Results result={result} pending={pending} />
      </div>

      <RunConfirm
        open={confirming !== null}
        onOpenChange={(open) => !pending && !open && setConfirming(null)}
        projectName={projectName}
        projectRef={projectRef}
        sql={confirming ?? ""}
        busy={pending}
        onConfirm={() => confirming !== null && run(confirming, true)}
      />
    </div>
  );
}
