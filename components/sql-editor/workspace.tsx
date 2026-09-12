"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { SavedQuery } from "@/lib/saved-queries";
import { QueryDialogs, type QueryDialog } from "./query-dialogs";
import { Results } from "./results";
import { RunConfirm } from "./run-confirm";
import { RunningQueries } from "./running-queries";
import { SavedQueriesSidebar } from "./saved-queries-sidebar";
import { SqlTabBar } from "./tab-bar";
import { useRunSql } from "./use-run-sql";
import { useBuffer, useDirtyTabs, useSqlTabs, writeBuffer } from "./tabs";
import { EditorToolbar } from "./toolbar";
import { useSavedQueries } from "./use-saved-queries";

// Route-scoped on purpose: CodeMirror is the largest thing on this page, and an entire plan exists
// about this app's latency. `ssr: false` because the editor needs a DOM element to attach to.
const SqlCodeEditor = dynamic(() => import("./editor"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-muted/20" />,
});

/**
 * The page: the open tabs, the saved list, and the dialogs between them. The run flow itself lives
 * in `use-run-sql.ts`.
 *
 * The buffer is not React state: it lives in `sessionStorage` through `tabs.ts`, so a reload comes
 * back to the same text in every tab. The editor is remounted by `key` when the active tab changes,
 * which is also how a tab switch loads that tab's text without an imperative document API.
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
  const saved = useSavedQueries(projectRef, initialQueries ?? []);
  const { tabs, activeId, activate, open, openText, add, link, close } = useSqlTabs(projectRef);
  const dirtyIds = useDirtyTabs(projectRef, tabs, saved.queries);

  const sql = useBuffer(projectRef, activeId);
  const { result, confirming, running, busy, run, cancelConfirm, forget } = useRunSql(
    projectRef,
    activeId,
  );
  const [dialog, setDialog] = useState<QueryDialog | null>(null);
  const [showRunning, setShowRunning] = useState(false);

  /** The tab and its results go together; nothing will ask for a closed tab's rows again. */
  const closeAll = (tab: { id: string }) => {
    close(tab.id);
    forget(tab.id);
  };

  const activeTab = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const active = activeTab.queryId
    ? (saved.queries.find((q) => q.id === activeTab.queryId) ?? null)
    : null;

  return (
    <div className="flex h-screen min-w-0">
      <SavedQueriesSidebar
        queries={saved.queries}
        unavailable={initialQueries === null}
        activeId={activeTab.queryId}
        pending={saved.pending}
        error={saved.error}
        onOpen={(query) => open(query.id, query.sql)}
        onRename={(query) => setDialog({ kind: "rename", query })}
        onToggleFavorite={(query) => saved.update(query.id, { favorite: !query.favorite })}
        onDelete={(query) => setDialog({ kind: "delete", query })}
        onUseSnippet={openText}
        onShowRunning={() => setShowRunning(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <SqlTabBar
          tabs={tabs}
          activeId={activeId}
          queries={saved.queries}
          dirtyIds={dirtyIds}
          onSelect={activate}
          onClose={(tab) => (dirtyIds.has(tab.id) ? setDialog({ kind: "close", tab }) : closeAll(tab))}
          onAdd={add}
        />

        <EditorToolbar
          running={running}
          elsewhere={busy && !running}
          canRun={sql.trim() !== ""}
          savePending={saved.pending}
          activeName={active?.name ?? null}
          dirty={dirtyIds.has(activeId)}
          onRun={() => run(sql, false)}
          // An open query is updated in place; an unsaved buffer needs a name first. Without this,
          // saving the same buffer twice would leave two rows with the same name.
          onSave={() => (active ? saved.update(active.id, { sql }) : setDialog({ kind: "save-as" }))}
          onNew={add}
        />

        <div className="h-[45%] min-h-0 border-b border-border">
          {/* The document is sent untrimmed. Postgres counts `LINE n` from what it was given, so
              trimming here would shift every error position the editor underlines. */}
          <SqlCodeEditor
            key={activeId}
            initialValue={sql}
            onChange={(text) => writeBuffer(projectRef, activeId, text)}
            onRun={() => run(sql, false)}
            error={result?.status === "error" ? result.error : null}
          />
        </div>

        <div className="min-h-0 flex-1">
          <Results result={result} pending={running} />
        </div>
      </div>

      <RunConfirm
        open={confirming !== null}
        onOpenChange={(next) => !busy && !next && cancelConfirm()}
        projectName={projectName}
        projectRef={projectRef}
        sql={confirming?.sql ?? ""}
        busy={busy}
        // Resent for the tab that asked, which may no longer be the one on screen — otherwise a
        // write's outcome is filed under whatever tab the user happened to switch to.
        onConfirm={() => confirming && run(confirming.sql, true, confirming.tabId)}
      />

      {showRunning ? (
        <RunningQueries projectRef={projectRef} onOpenChange={setShowRunning} />
      ) : null}

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
                // The tab keeps its buffer and becomes that query's tab, so the next Save updates it.
                link(activeId, id);
                setDialog(null);
              })
        }
        onDelete={(query) =>
          // The tab stays open holding its buffer, no longer linked to anything. Closing it is the
          // user's decision, not a side effect of a delete in the sidebar.
          saved.remove(query.id, () => setDialog(null))
        }
        onCloseTab={(tab) => {
          closeAll(tab);
          setDialog(null);
        }}
      />
    </div>
  );
}
