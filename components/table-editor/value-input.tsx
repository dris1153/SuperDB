"use client";

import type { ColumnInfo } from "@/lib/table-view";
import { isBoolColumn, isJsonColumn, isWideColumn } from "@/lib/cell-value";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** The control for one column, chosen by its type. */
export function ValueInput({
  column,
  value,
  onChange,
  disabled,
}: {
  column: ColumnInfo;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  if (isBoolColumn(column)) {
    return (
      <Switch
        checked={value === "true"}
        disabled={disabled}
        onCheckedChange={(v) => onChange(v ? "true" : "false")}
        aria-label={column.name}
      />
    );
  }

  if (isWideColumn(column)) {
    return (
      <Textarea
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        rows={isJsonColumn(column) ? 4 : 2}
        placeholder={isJsonColumn(column) ? "{ }" : undefined}
        aria-label={column.name}
        className="font-mono text-xs"
      />
    );
  }

  return (
    <Input
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={column.name}
      className="h-8 font-mono text-xs"
    />
  );
}

