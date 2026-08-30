"use client";

import { IconArrowRight, IconKey, IconLink } from "@tabler/icons-react";
import { fkTarget, isTruncated, type ColumnInfo } from "@/lib/table-view";

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

/**
 * The jump button on a foreign-key cell.
 *
 * Navigation is a plain filtered read of the referenced table — no new query and no new state, so the
 * back button returns to where the user was. A target in a schema the sidebar does not list is shown
 * disabled and named, rather than as a link that goes nowhere.
 */
export function FkJump({
  column,
  row,
  reachable,
  tabIndex,
  onJump,
}: {
  column: ColumnInfo;
  /** The whole row: a composite key needs every one of its columns to address one row. */
  row: Record<string, unknown>;
  reachable: boolean;
  tabIndex?: number;
  onJump: (target: NonNullable<ReturnType<typeof fkTarget>>, row: Record<string, unknown>) => void;
}) {
  const target = fkTarget(column);
  if (!target) return null;

  // Every part of the key must be present and whole. A null makes the row unaddressable, and a value
  // the grid truncated would filter on the first 512 characters and silently match nothing.
  const values = target.pairs.map((p) => row[p.local]);
  if (values.some((v) => v === null || v === undefined)) return null;
  const cut = values.some(isTruncated);

  const label = `${target.schema}.${target.table}`;
  const why = !reachable
    ? `${label} is not listed in this editor`
    : cut
      ? "This value was shortened for display, so it cannot be matched exactly"
      : `View row in ${label}`;

  const disabled = !reachable || cut;
  return (
    // A disabled button swallows pointer events, so the title would never show — the same reason
    // `toolbar.tsx` wraps its disabled Insert button.
    <span className="inline-flex shrink-0" title={why}>
      <button
        onClick={() => onJump(target, row)}
        disabled={disabled}
        tabIndex={tabIndex}
        aria-label={`View referenced row in ${label}`}
        className="rounded border border-border p-0.5 text-subtle hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <IconArrowRight size={12} stroke={1.5} />
      </button>
    </span>
  );
}

/** Header cell: name, short Postgres type, and key markers — the shape Supabase's editor uses. */
export function HeaderCell({
  column,
  menu,
}: {
  column: ColumnInfo;
  menu?: React.ReactNode;
}) {
  const target = fkTarget(column);
  return (
    <div className="group/col flex items-center gap-1.5 overflow-hidden">
      {target ? (
        <IconLink
          size={13}
          stroke={1.5}
          className="shrink-0 text-subtle"
          title={`References ${target.schema}.${target.table}(${target.column})`}
        />
      ) : null}
      {column.is_pk ? (
        <IconKey size={13} stroke={1.5} className="shrink-0 text-primary" title="Primary key" />
      ) : null}
      <span className="truncate font-medium text-foreground">{column.name}</span>
      <span className="shrink-0 font-mono text-[11px] font-normal text-subtle">
        {column.short_type}
      </span>
      {menu ? <span className="ml-auto shrink-0">{menu}</span> : null}
    </div>
  );
}
