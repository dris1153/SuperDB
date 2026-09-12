"use client";

import { IconPlus, IconX } from "@tabler/icons-react";
import type { SavedQuery } from "@/lib/saved-queries";
import type { SqlTab } from "./tabs";
import { cn } from "@/lib/utils";

/**
 * The open queries.
 *
 * A tab's label is read from the saved list every render rather than stored with the tab, so a query
 * renamed in the sidebar is renamed here too. A query deleted there leaves its tab holding its
 * buffer, labelled as unsaved — closing it stays the user's decision.
 */
export function SqlTabBar({
  tabs,
  activeId,
  queries,
  dirtyIds,
  onSelect,
  onClose,
  onAdd,
}: {
  tabs: SqlTab[];
  activeId: string;
  queries: SavedQuery[];
  /** Tabs whose buffer differs from what is saved. */
  dirtyIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onClose: (tab: SqlTab) => void;
  onAdd: () => void;
}) {
  return (
    <div className="flex shrink-0 items-stretch overflow-x-auto border-b border-border scrollbar-none">
      {tabs.map((tab) => {
        const saved = tab.queryId ? queries.find((q) => q.id === tab.queryId) : undefined;
        const active = tab.id === activeId;
        const dirty = dirtyIds.has(tab.id);
        // A tab holding an id that resolves to nothing is not the same as one never saved: the query
        // was deleted, or sits past the list's limit. Either way the text here is not known to be
        // stored anywhere, and saying "Untitled" would imply it never was.
        const label = saved?.name ?? (tab.queryId ? "Unlinked query" : "Untitled query");

        return (
          <div
            key={tab.id}
            className={cn(
              "group flex items-center gap-1.5 border-r border-border pr-1.5 pl-3 text-xs",
              active ? "bg-card text-foreground" : "text-subtle hover:bg-muted",
            )}
          >
            <button onClick={() => onSelect(tab.id)} className="flex items-center gap-1.5 py-2">
              <span className="max-w-40 truncate">{label}</span>
              {dirty ? (
                <span aria-label="Unsaved changes" title="Unsaved changes" className="text-warn">
                  •
                </span>
              ) : null}
            </button>
            <button
              onClick={() => onClose(tab)}
              aria-label={`Close ${label}`}
              className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-border"
            >
              <IconX size={12} stroke={1.5} />
            </button>
          </div>
        );
      })}

      <button onClick={onAdd} aria-label="New query tab" className="px-2.5 text-subtle hover:bg-muted">
        <IconPlus size={13} stroke={1.5} />
      </button>
    </div>
  );
}
