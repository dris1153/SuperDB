"use client";

import { useEffect, useState } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { useTableUrl } from "./url";

/**
 * Free-text search across every column.
 *
 * Submitted rather than typed-through: each search is a sequential scan of the whole table, so
 * firing one per keystroke would be a query per character. Enter or the clear button, nothing else.
 */
export function SearchBox({ search }: { search: string }) {
  const { set, pending } = useTableUrl();
  const [draft, setDraft] = useState(search);

  // The URL is the truth — a jump to another table, or the back button, must reset the box.
  useEffect(() => {
    setDraft(search);
  }, [search]);

  const submit = (value: string) => set({ q: value === "" ? null : value, page: "1" });

  return (
    <div className="relative">
      <IconSearch
        size={13}
        stroke={1.5}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle"
      />
      <Input
        value={draft}
        disabled={pending}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit(draft.trim());
          if (e.key === "Escape") setDraft(search);
        }}
        placeholder="Search all columns…"
        aria-label="Search all columns"
        className="h-7 w-56 pr-7 pl-7 text-xs"
      />
      {search !== "" ? (
        <button
          onClick={() => {
            setDraft("");
            submit("");
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-subtle hover:bg-muted hover:text-foreground"
        >
          <IconX size={12} stroke={1.5} />
        </button>
      ) : null}
    </div>
  );
}
