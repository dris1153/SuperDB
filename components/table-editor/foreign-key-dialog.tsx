"use client";

import { useState } from "react";
import { FK_ACTIONS, type FkAction, type ForeignKey } from "@/lib/column-statements";
import type { TableColumns } from "@/lib/table-entities";
import type { TableEntry } from "@/lib/table-editor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjectPart } from "@/components/use-project-part";

/**
 * Where a new foreign key points: schema, table, column, and what happens on update and delete.
 * Nothing runs from here — the key joins the panel's draft and is saved with the rest of it.
 */
export function ForeignKeyDialog({
  open,
  onOpenChange,
  projectRef,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRef: string;
  onAdd: (key: ForeignKey) => void;
}) {
  const [schema, setSchema] = useState("public");
  const [table, setTable] = useState("");
  const [column, setColumn] = useState("");
  const [onUpdate, setOnUpdate] = useState<FkAction>("a");
  const [onDelete, setOnDelete] = useState<FkAction>("a");

  const schemas = useProjectPart<{ schemas: string[] }>(projectRef, "schemas", undefined, { enabled: open });
  const tables = useProjectPart<TableEntry[]>(projectRef, "schema-tables", { schema }, { enabled: open });
  const columns = useProjectPart<TableColumns>(projectRef, "table-columns", { schema, table }, { enabled: open && table !== "" });

  const tableNames = tables.status === "ready" ? tables.data.filter((t) => t.kind === "r" || t.kind === "p").map((t) => t.name) : [];
  const columnNames = columns.status === "ready" ? columns.data.columns.map((c) => c.name) : [];

  const reset = () => {
    setTable("");
    setColumn("");
    setOnUpdate("a");
    setOnDelete("a");
  };

  const add = () => {
    onAdd({ name: null, schema, table, column, onUpdate, onDelete });
    reset();
    onOpenChange(false);
  };

  const pick = (label: string, value: string, options: string[], onChange: (v: string) => void, placeholder: string) => (
    <label className="block space-y-1.5">
      <span className="text-sm text-foreground">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="font-mono text-xs">
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );

  const action = (label: string, value: FkAction, onChange: (v: FkAction) => void) => (
    <label className="block space-y-1.5">
      <span className="text-sm text-foreground">{label}</span>
      <Select value={value} onValueChange={(v) => onChange(v as FkAction)}>
        <SelectTrigger className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FK_ACTIONS.map((a) => (
            <SelectItem key={a.code} value={a.code}>
              {a.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add foreign key</DialogTitle>
          <DialogDescription>The column this one references. It is added when the column is saved.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {pick("Schema", schema, schemas.status === "ready" ? schemas.data.schemas : [schema], (s) => { setSchema(s); setTable(""); setColumn(""); }, "Choose a schema")}
          {pick("Table", table, tableNames, (t) => { setTable(t); setColumn(""); }, tables.status === "ready" ? "Choose a table" : "Reading tables…")}
          {pick("Column", column, columnNames, setColumn, table ? "Choose a column" : "Choose a table first")}
          <div className="grid gap-4 sm:grid-cols-2">
            {action("On update", onUpdate, setOnUpdate)}
            {action("On delete", onDelete, setOnDelete)}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={!table || !column} onClick={add}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
