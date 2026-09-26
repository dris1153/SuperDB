"use client";

import { IconX } from "@tabler/icons-react";
import { DEFAULT_EXPRESSIONS, IDENTITY_TYPES, type NewColumn } from "@/lib/ddl-build";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TypePicker } from "./type-picker";

/**
 * Sentinels for the two picker entries that are not expressions. Radix refuses an empty value, and a
 * leading space is too easy for a tool to eat, so they are spelled out.
 */
const LITERAL = "__literal";
const NONE = "__none";

/**
 * One column's fields, shared by the new-table sheet and the Add column sheet.
 *
 * The default picker offers the fixed list and nothing else, because a default is executed rather
 * than escaped. "A value" is the one free field and it is quoted as a literal, so it cannot become
 * an expression. Editing an *existing* column allows raw SQL, but only from the sheet that says so.
 */
export function ColumnForm({
  column,
  types,
  onChange,
  onRemove,
  allowPrimaryKey = true,
}: {
  column: NewColumn;
  /** The project's own type list. Empty while it is still being read. */
  types: string[];
  onChange: (next: NewColumn) => void;
  onRemove?: () => void;
  /** False when adding to an existing table: `add column` cannot declare a key. */
  allowPrimaryKey?: boolean;
}) {
  const kind =
    column.default == null
      ? NONE
      : column.default.kind === "literal"
        ? LITERAL
        : column.default.value;

  const setDefault = (next: string) =>
    onChange({
      ...column,
      default:
        next === NONE
          ? null
          : next === LITERAL
            ? { kind: "literal", value: "" }
            : { kind: "expression", value: next },
    });

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Input
          value={column.name}
          onChange={(e) => onChange({ ...column, name: e.target.value })}
          placeholder="column name"
          aria-label="Column name"
          className="h-8 font-mono text-xs"
        />
        <TypePicker
          value={column.type}
          types={types}
          onChange={(type) => onChange({ ...column, type })}
        />
        {onRemove ? (
          <button
            onClick={onRemove}
            aria-label={`Remove ${column.name || "column"}`}
            className="rounded p-1 text-subtle hover:bg-muted hover:text-foreground"
          >
            <IconX size={14} stroke={1.5} />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        {allowPrimaryKey ? (
          <label className="flex items-center gap-1.5">
            <Switch
              checked={column.primaryKey}
              // A primary key column cannot be null, so saying both is a contradiction Postgres
              // would reject — the switch settles it rather than passing the conflict on.
              onCheckedChange={(v) =>
                onChange({ ...column, primaryKey: v, nullable: v ? false : column.nullable })
              }
            />
            Primary key
          </label>
        ) : null}
        <label className="flex items-center gap-1.5">
          <Switch
            checked={!column.nullable}
            disabled={column.primaryKey}
            onCheckedChange={(v) => onChange({ ...column, nullable: !v })}
          />
          Not null
        </label>
        <label className="flex items-center gap-1.5">
          {/* Disabled rather than left to throw: the builder refuses an identity on a non-integer
              column, and a switch that only reports its mistake in the footer is worse than one
              that cannot be flipped. */}
          <Switch
            checked={column.identity === true}
            disabled={!IDENTITY_TYPES.has(column.type)}
            onCheckedChange={(v) =>
              onChange({ ...column, identity: v, default: v ? null : column.default })
            }
          />
          Auto-increment
        </label>
      </div>

      {column.identity ? null : (
        <div className="flex items-center gap-2">
          <Select value={kind} onValueChange={setDefault}>
            <SelectTrigger size="sm" className="h-8 w-44 text-xs" aria-label="Default">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className="text-xs">
                No default
              </SelectItem>
              {DEFAULT_EXPRESSIONS.map((e) => (
                <SelectItem key={e} value={e} className="font-mono text-xs">
                  {e}
                </SelectItem>
              ))}
              <SelectItem value={LITERAL} className="text-xs">
                A value…
              </SelectItem>
            </SelectContent>
          </Select>
          {column.default?.kind === "literal" ? (
            <Input
              value={column.default.value}
              onChange={(e) =>
                onChange({ ...column, default: { kind: "literal", value: e.target.value } })
              }
              placeholder="default value"
              aria-label="Default value"
              className="h-8 font-mono text-xs"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

/** A fresh row for the sheets, so both start a column the same way. */
export const blankColumn = (): NewColumn => ({
  name: "",
  type: "text",
  nullable: true,
  primaryKey: false,
});
