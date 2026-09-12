"use client";

import dynamic from "next/dynamic";
import { useState, useTransition } from "react";
import type { SavedQuery } from "@/lib/saved-queries";
import { runSql, type RunResult } from "@/lib/sql-editor-actions";
import { QueryDialogs, type QueryDialog } from "./query-dialogs";
import { Results } from "./results";
import { RunConfirm } from "./run-confirm";
import { SavedQueriesSidebar } from "./saved-queries-sidebar";
import { EditorToolbar } from "./toolbar";
import { useSavedQueries } from "./use-saved-queries";

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
 *
 * The editor is remounted by `key` to load a saved query. Replacing the document through an
 * imperative handle would be the same number of moving parts and would also have to decide what
 * happens to the undo history; a remount answers that by starting a new one, which is what opening
 * a different query means anyway.
 */
export function SqlWorkspace({
  projectRef,
  projectName,
  initialQueries,
}: {
  projectRef: string;
  projectName: string;
  /** Null when the list could not be read at all — a different thing from having none. */
  initialQueries: SavedQuery[] | null;
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

  const saved = useSavedQueries(projectRef, initialQueries ?? []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [dialog, setDialog] = useState<QueryDialog | null>(null);

  const active = saved.queries.find((q) => q.id === activeId) ?? null;
  // Compared against what is saved, whitespace included: a buffer holding only spaces is still an
  // edit, and the empty-new-query case is already covered by both sides being "".
  const dirty = sql !== (active?.sql ?? "");

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

  /** Replaces the buffer, so it is only ever reached with the user's answer in hand. */
  const load = (next: SavedQuery | null) => {
    setActiveId(next?.id ?? null);
    setSql(next?.sql ?? "");
    setEditorKey((key) => key + 1);
    setResult(null);
    setDialog(null);
  };

  const openQuery = (next: SavedQuery | null) =>
    dirty ? setDialog({ kind: "discard", next }) : load(next);

  return (
    <div className="flex h-screen min-w-0">
      <SavedQueriesSidebar
        queries={saved.queries}
        unavailable={initialQueries === null}
        activeId={activeId}
        pending={saved.pending}
        error={saved.error}
        onOpen={openQuery}
        onRename={(query) => setDialog({ kind: "rename", query })}
        onToggleFavorite={(query) => saved.update(query.id, { favorite: !query.favorite })}
        onDelete={(query) => setDialog({ kind: "delete", query })}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <EditorToolbar
          running={pending}
          canRun={sql.trim() !== ""}
          savePending={saved.pending}
          activeName={active?.name ?? null}
          dirty={dirty}
          onRun={() => run(sql, false)}
          // An open query is updated in place; an unsaved buffer needs a name first. Without this,
          // saving the same buffer twice would leave two rows with the same name.
          onSave={() => (active ? saved.update(active.id, { sql }) : setDialog({ kind: "save-as" }))}
          onNew={() => openQuery(null)}
        />

        <div className="h-[45%] min-h-0 border-b border-border">
          {/* The document is sent untrimmed. Postgres counts `LINE n` from what it was given, so
              trimming here would shift every error position the editor underlines. */}
          <SqlCodeEditor
            key={editorKey}
            initialValue={sql}
            onChange={setSql}
            onRun={() => run(sql, false)}
            error={result?.status === "error" ? result.error : null}
          />
        </div>

        <div className="min-h-0 flex-1">
          <Results result={result} pending={pending} />
        </div>
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

      <QueryDialogs
        dialog={dialog}
        busy={saved.pending}
        error={saved.error}
        onClose={() => {
          saved.dismissError();
          setDialog(null);
        }}
        onName={(name) =>
          dialog?.kind === "rename"
            ? saved.update(dialog.query.id, { name }, () => setDialog(null))
            : saved.create(name, sql, (id) => {
                setActiveId(id);
                setDialog(null);
              })
        }
        onDelete={(query) =>
          saved.remove(query.id, () => {
            if (query.id === activeId) setActiveId(null);
            setDialog(null);
          })
        }
        onDiscard={load}
      />
    </div>
  );
}
