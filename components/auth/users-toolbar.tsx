"use client";

import { IconChevronDown, IconPlus, IconRefresh, IconSearch, IconSortDescending } from "@tabler/icons-react";
import { SORTS, type UserSort } from "@/lib/auth-users";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColumnPicker, type ColumnKey } from "./column-picker";

/**
 * The field the search box searches.
 *
 * **Not a placeholder change.** The admin API has exactly one `?filter=`, a substring match, so
 * Email and Phone both send it — and `id` does not search at all: an id is exact, it has its own
 * endpoint, and the part reads that user directly. Measured 2026-09-25: `?email=` is accepted and
 * ignored, which is why nothing here sends a field name to the API.
 */
export const SEARCH_FIELDS = [
  { value: "filter", label: "Email address", placeholder: "Search by email" },
  { value: "phone", label: "Phone", placeholder: "Search by phone" },
  { value: "id", label: "UID", placeholder: "Look up a user by UID" },
] as const;

export type SearchField = (typeof SEARCH_FIELDS)[number]["value"];

export function UsersToolbar({
  field,
  onField,
  search,
  onSearch,
  sort,
  onSort,
  hidden,
  toggle,
  onRefresh,
  refreshing,
  onCreate,
  onInvite,
}: {
  field: SearchField;
  onField: (next: SearchField) => void;
  search: string;
  onSearch: (next: string) => void;
  sort: UserSort;
  onSort: (next: UserSort) => void;
  hidden: ColumnKey[];
  toggle: (key: ColumnKey) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onCreate: () => void;
  onInvite: () => void;
}) {
  const current = SEARCH_FIELDS.find((f) => f.value === field) ?? SEARCH_FIELDS[0];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <div className="flex items-center overflow-hidden rounded-md border border-border">
          <Select value={field} onValueChange={(next) => onField(next as SearchField)}>
            <SelectTrigger className="h-9 w-40 rounded-none border-0 border-r border-border">
              <span className="flex items-center gap-2">
                <IconSearch className="size-4 text-subtle" />
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {SEARCH_FIELDS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={current.placeholder}
            className="h-9 w-64 rounded-none border-0 focus-visible:ring-0"
          />
        </div>

        {/* Only one field can be ordered by — `id`, `email` and `updated_at` are each refused with
            `400 Bad Sort Parameters`. The label says what it does rather than borrowing the
            original's "Sorted by user ID", which this API cannot do. */}
        <Select value={sort} onValueChange={(next) => onSort(next as UserSort)}>
          <SelectTrigger className="h-9 w-40 gap-2">
            <IconSortDescending className="size-4 text-subtle" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <ColumnPicker hidden={hidden} toggle={toggle} />

        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh"
          title="Refresh"
        >
          <IconRefresh className={refreshing ? "size-4 animate-spin" : "size-4"} />
        </Button>

        <div className="flex items-center overflow-hidden rounded-md">
          <Button size="sm" className="gap-2 rounded-r-none" onClick={onCreate}>
            <IconPlus className="size-4" />
            Add user
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="rounded-l-none border-l border-black/20 px-2" aria-label="More ways to add a user">
                <IconChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onCreate}>Create a new user</DropdownMenuItem>
              <DropdownMenuItem onSelect={onInvite}>Send an invitation</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
