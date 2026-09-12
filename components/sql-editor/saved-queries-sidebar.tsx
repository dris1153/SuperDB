"use client";

import { useMemo, useState } from "react";
import {
  IconDots,
  IconSearch,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconPencil,
} from "@tabler/icons-react";
import type { SavedQuery } from "@/lib/saved-queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  unavailable,
  activeId,
  pending,
  error,
  onOpen,
  onRename,
  onToggleFavorite,
  onDelete,
}: {
  queries: SavedQuery[];
  /** The list could not be read. Saying "nothing saved yet" instead would be a claim, not a fact. */
  unavailable: boolean;
  activeId: string | null;
  /** A mutation is in flight. The row controls go with it — see the note on Section. */
  pending: boolean;
  error: string | null;
  onOpen: (query: SavedQuery) => void;
  onRename: (query: SavedQuery) => void;
  onToggleFavorite: (query: SavedQuery) => void;
  onDelete: (query: SavedQuery) => void;
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
        {unavailable ? (
          <p className="px-3 py-6 text-center text-xs text-subtle">
            Saved queries could not be read. The editor still works.
          </p>
        ) : queries.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-subtle">
            Nothing saved for this project yet.
          </p>
        ) : shown.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-subtle">No query matches “{search}”.</p>
        ) : (
          <>
            <Section title="Favorites" queries={favorites} {...{ activeId, pending, onOpen, onRename, onToggleFavorite, onDelete }} />
            <Section title="Private" queries={rest} {...{ activeId, pending, onOpen, onRename, onToggleFavorite, onDelete }} />
          </>
        )}
      </div>

      {error ? <p className="border-t border-border px-3 py-2 text-xs text-destructive">{error}</p> : null}
    </aside>
  );
}

/**
 * Rows are inert while a mutation is in flight. Each action answers with the list as it stood after
 * its own write, so two overlapping stars can land in either order and the second answer can be the
 * older one — leaving a row rendered unstarred while the database has it starred.
 */
function Section({
  title,
  queries,
  activeId,
  pending,
  onOpen,
  onRename,
  onToggleFavorite,
  onDelete,
}: {
  title: string;
  queries: SavedQuery[];
  activeId: string | null;
  pending: boolean;
  onOpen: (query: SavedQuery) => void;
  onRename: (query: SavedQuery) => void;
  onToggleFavorite: (query: SavedQuery) => void;
  onDelete: (query: SavedQuery) => void;
}) {
  if (queries.length === 0) return null;

  return (
    <div className="mb-2">
      <div className="px-3 py-1 text-[10px] uppercase tracking-wide text-subtle/70">{title}</div>
      {queries.map((query) => {
        const active = query.id === activeId;
        return (
          <div
            key={query.id}
            className={cn(
              "group flex items-center gap-1 pr-1 pl-3",
              active ? "bg-muted" : "hover:bg-muted/60",
            )}
          >
            <button
              type="button"
              onClick={() => onOpen(query)}
              title={query.name}
              className={cn(
                "min-w-0 flex-1 truncate py-1.5 text-left text-xs",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {query.name}
            </button>

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-subtle hover:text-warn"
              aria-label={query.favorite ? `Unfavourite ${query.name}` : `Favourite ${query.name}`}
              disabled={pending}
              onClick={() => onToggleFavorite(query)}
            >
              {query.favorite ? (
                <IconStarFilled size={12} className="text-warn" />
              ) : (
                <IconStar size={12} stroke={1.5} />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-subtle"
                  aria-label={`Actions for ${query.name}`}
                  disabled={pending}
                >
                  <IconDots size={12} stroke={1.5} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => onRename(query)}>
                  <IconPencil size={13} stroke={1.5} />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete(query)}>
                  <IconTrash size={13} stroke={1.5} />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}
