"use client";

import { memo } from "react";
import { IconDots, IconPencil, IconStar, IconStarFilled, IconTrash } from "@tabler/icons-react";
import type { SavedQuery } from "@/lib/saved-queries";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Memoised: the statement lives in the page's store, so every keystroke re-renders the workspace,
 * and none of it can change a row. Same reason as `results.tsx`.
 *
 * Rows are inert while a mutation is in flight. Each action answers with the list as it stood after
 * its own write, so two overlapping stars can land in either order and the second answer can be the
 * older one — leaving a row rendered unstarred while the database has it starred.
 */
export const QuerySection = memo(function QuerySection({
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
});
