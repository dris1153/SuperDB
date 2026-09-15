"use client";

import { useMemo, useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import type { SavedQuery } from "@/lib/saved-queries";
import { Input } from "@/components/ui/input";
import { QuerySection } from "./query-section";
import { ReferenceSection } from "./reference-section";
import { cn } from "@/lib/utils";

/**
 * FAVORITES and PRIVATE, and a box to find a query by name.
 *
 * **SHARED is absent, not empty.** Every user here sees only their own connections and there is no
 * multi-person organisation in this app, so an empty SHARED section would claim that sharing exists
 * and is merely unused — a different and wrong claim. The same call `project-nav.tsx` makes about
 * Integrations.
 *
 * Search is client-side: the list is already loaded and small, so a round trip per keystroke would
 * cost something and buy nothing.
 */
export function SavedQueriesSidebar({
  queries,
  loading,
  unavailable,
  activeId,
  pending,
  error,
  onOpen,
  onRename,
  onToggleFavorite,
  onDelete,
  onUseSnippet,
  onShowRunning,
}: {
  queries: SavedQuery[];
  /** Still being read. An empty sidebar during that would claim there is nothing saved. */
  loading: boolean;
  /** Why the list could not be read, if it could not. */
  unavailable: string | null;
  activeId: string | null;
  /** A mutation is in flight. The row controls go with it — see the note on QuerySection. */
  pending: boolean;
  error: string | null;
  onOpen: (query: SavedQuery) => void;
  onRename: (query: SavedQuery) => void;
  onToggleFavorite: (query: SavedQuery) => void;
  onDelete: (query: SavedQuery) => void;
  onUseSnippet: (sql: string) => void;
  onShowRunning: () => void;
}) {
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q === "" ? queries : queries.filter((s) => s.name.toLowerCase().includes(q));
  }, [queries, search]);

  const favorites = shown.filter((s) => s.favorite);
  const rest = shown.filter((s) => !s.favorite);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="p-2">
        <div className="relative">
          <IconSearch
            size={13}
            stroke={1.5}
            className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-subtle"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search queries"
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <div className={cn("flex-1 overflow-y-auto pb-2 transition-opacity", pending && "opacity-60")}>
        {loading ? (
          <div className="space-y-1 px-3 py-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="block h-5 w-full animate-pulse rounded bg-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : unavailable ? (
          <p className="px-3 py-6 text-center text-xs text-subtle">
            Saved queries could not be read. The editor still works.
            <span className="mt-1 block">{unavailable}</span>
          </p>
        ) : queries.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-subtle">
            Nothing saved for this project yet.
          </p>
        ) : shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-subtle">No query matches “{search}”.</p>
        ) : (
          <>
            <QuerySection title="Favorites" queries={favorites} {...{ activeId, pending, onOpen, onRename, onToggleFavorite, onDelete }} />
            <QuerySection title="Private" queries={rest} {...{ activeId, pending, onOpen, onRename, onToggleFavorite, onDelete }} />
          </>
        )}
      </div>

      {error ? <p className="border-t border-border px-3 py-2 text-xs text-destructive">{error}</p> : null}

      <ReferenceSection onUse={(snippet) => onUseSnippet(snippet.sql)} onShowRunning={onShowRunning} />
    </aside>
  );
}
