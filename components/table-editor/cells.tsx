"use client";

import { IconKey, IconLink } from "@tabler/icons-react";
import type { ColumnInfo } from "@/lib/table-view";

/**
 * Rendering for one grid cell.
 *
 * Values arrive as parsed JSON from the Management API, so a `jsonb` column is already an object and
 * a `null` is already `null` — there is no type information left on the value itself. Postgres NULL
 * and the string "NULL" must still read differently, hence the styled marker rather than text.
 */
/** Types that read better in a monospace face, whether or not they arrived truncated as text. */
const MONO = new Set(["json", "jsonb", "uuid", "bytea", "xml", "inet", "macaddr"]);

export function CellValue({ value, type }: { value: unknown; type?: string }) {
  if (value === null || value === undefined) {
    return <span className="italic text-subtle">NULL</span>;
  }
  if (typeof value === "boolean") {
    return <span className="text-brand-text">{value ? "true" : "false"}</span>;
  }
  if (typeof value === "object") {
    return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  }
  if (typeof value === "number") {
    return <span className="tabular-nums">{value}</span>;
  }
  const text = String(value);
  if (text === "") return <span className="italic text-subtle">empty</span>;
  // A bigint past Number.MAX_SAFE_INTEGER arrives as a string, so numeric-looking text still lines up.
  const mono = type != null && (MONO.has(type) || MONO.has(type.replace(/^_/, "")));
  return <span className={mono ? "font-mono text-xs" : undefined}>{text}</span>;
}

/** Header cell: name, short Postgres type, and key markers — the shape Supabase's editor uses. */
export function HeaderCell({ column }: { column: ColumnInfo }) {
  return (
    <div className="flex items-center gap-1.5 overflow-hidden">
      {column.fk_target ? (
        <IconLink size={13} stroke={1.5} className="shrink-0 text-subtle" title={`References ${column.fk_target}`} />
      ) : null}
      {column.is_pk ? (
        <IconKey size={13} stroke={1.5} className="shrink-0 text-primary" title="Primary key" />
      ) : null}
      <span className="truncate font-medium text-foreground">{column.name}</span>
      <span className="shrink-0 font-mono text-[11px] font-normal text-subtle">{column.short_type}</span>
    </div>
  );
}
