"use client";

import { IconCopy, IconDots, IconFileCode } from "@tabler/icons-react";
import { quoteQualified } from "@/lib/sql-ident";
import type { TableEntry } from "@/lib/table-editor";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => {});

/**
 * The per-table menu, read-only.
 *
 * No Rename, Duplicate, Truncate or Delete — those belong to the writes plan, and a row that can
 * never become enabled in this plan is noise rather than a roadmap.
 */
export function TableMenu({
  schema,
  entry,
  onViewDefinition,
}: {
  schema: string;
  entry: TableEntry;
  onViewDefinition: () => void;
}) {
  const qualified = quoteQualified(schema, entry.name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Options for ${entry.name}`}
          // The row itself is a button; without this the menu click would also select the table.
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="rounded p-0.5 text-subtle opacity-0 group-hover/row:opacity-100 hover:bg-border hover:text-foreground data-[state=open]:opacity-100"
        >
          <IconDots size={13} stroke={1.5} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DropdownMenuItem onSelect={() => copy(`${schema}.${entry.name}`)}>
          <IconCopy size={14} stroke={1.5} /> Copy name
        </DropdownMenuItem>
        {/* Quoted, so a mixed-case or reserved-word name pastes into psql and runs unchanged. */}
        <DropdownMenuItem onSelect={() => copy(`select * from ${qualified} limit 100;`)}>
          <IconCopy size={14} stroke={1.5} /> Copy select statement
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onViewDefinition}>
          <IconFileCode size={14} stroke={1.5} /> View definition
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
