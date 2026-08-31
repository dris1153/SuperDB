"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { TypePicker } from "./type-picker";

/**
 * What dropping this column costs.
 *
 * Only a *known* zero stays quiet. The count is null while it is in flight and also whenever it
 * failed — a statement timeout on a large table looks exactly like an empty column, so silence there
 * would hide the one thing this warning exists for.
 */
export function DropWarning({ usage }: { usage: { total: number; filled: number } | null }) {
  if (usage == null) {
    return <p>Could not read how many rows hold a value here. Assume this column has data in it.</p>;
  }
  if (usage.filled === 0) return null;
  return (
    <p>
      {usage.filled} of {usage.total} rows hold a value in this column. Dropping it discards every
      one of them.
    </p>
  );
}

/**
 * The fields for one existing column.
 *
 * Split from the sheet for size. The default is a free SQL field here, unlike the new-table form:
 * someone renaming a column on a live table is already reading DDL, the label says the field is run
 * as written, and the statement is shown in full before it runs.
 */
export function ColumnEditFields({
  name,
  setName,
  type,
  setType,
  types,
  notNull,
  setNotNull,
  def,
  setDef,
  usage,
}: {
  name: string;
  setName: (next: string) => void;
  type: string;
  setType: (next: string) => void;
  types: string[];
  notNull: boolean;
  setNotNull: (next: boolean) => void;
  def: string;
  setDef: (next: string) => void;
  /** How many rows hold a value, once the count comes back. */
  usage: { total: number; filled: number } | null;
}) {
  return (
    <div className="space-y-4 px-4 pb-6">
      <div className="space-y-1.5">
        <span className="text-xs text-subtle">Name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Column name"
          className="h-8 font-mono text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-xs text-subtle">Type</span>
        <TypePicker value={type} types={types} onChange={setType} />
      </div>

      <label className="flex items-center gap-2 text-xs">
        <Switch checked={notNull} onCheckedChange={setNotNull} />
        Not null
      </label>

      <div className="space-y-1.5">
        <span className="text-xs text-subtle">
          Default — <span className="text-warn">raw SQL</span>, run as written. Leave empty for none.
        </span>
        <Textarea
          value={def}
          onChange={(e) => setDef(e.target.value)}
          rows={2}
          placeholder="now()"
          aria-label="Default expression"
          className="font-mono text-xs"
        />
      </div>

      {usage ? (
        <p className="text-xs text-subtle">
          {usage.filled} of {usage.total} row{usage.total === 1 ? "" : "s"} hold a value here.
        </p>
      ) : null}
    </div>
  );
}
