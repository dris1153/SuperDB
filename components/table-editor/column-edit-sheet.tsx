"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { alterColumn, dropColumn } from "@/lib/ddl-statements";
import type { ColumnChange } from "@/lib/ddl-build";
import {
  alterColumn as alterColumnAction,
  columnUsage,
  dropColumn as dropColumnAction,
  listColumnTypes,
} from "@/lib/ddl-actions";
import type { ColumnInfo } from "@/lib/table-view";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ColumnEditFields, DropWarning } from "./column-edit-fields";
import { DdlConfirm } from "./ddl-confirm";

/**
 * Editing or dropping one existing column.
 *
 * The default is free text here, unlike the new-table sheet. The plan settled it that way and the
 * reason is the person: someone renaming a column on a live table is already reading DDL, the field
 * says it takes SQL, and the statement is shown in full before it runs. Refusing `nextval(…)` there
 * would not be safety, only a smaller tool.
 */
export function ColumnEditSheet({
  column,
  onClose,
  projectRef,
  projectName,
  schema,
  table,
  columnCount,
}: {
  /** Null when nothing is being edited. */
  column: ColumnInfo | null;
  onClose: () => void;
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
  columnCount: number;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [notNull, setNotNull] = useState(false);
  const [def, setDef] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [usage, setUsage] = useState<{ total: number; filled: number } | null>(null);
  const [mode, setMode] = useState<"alter" | "drop" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // Seeding from the new column is an adjustment to a prop change, so it happens during render.
  const [seen, setSeen] = useState(column);
  if (column !== seen) {
    setSeen(column);
    setName(column?.name ?? "");
    setType(column?.short_type ?? "");
    setNotNull(column ? !column.nullable : false);
    setDef(column?.default_expr ?? "");
    setUsage(null);
    setError(null);
  }

  useEffect(() => {
    if (!column) return;
    let cancelled = false;
    listColumnTypes(projectRef).then((t) => !cancelled && setTypes(t));
    columnUsage(projectRef, schema, table, column.name).then((u) => !cancelled && setUsage(u));
    return () => {
      cancelled = true;
    };
  }, [column, projectRef, schema, table]);

  const change: ColumnChange = {
    rename: name,
    type: column && type !== column.short_type ? type : undefined,
    nullable: column && !notNull !== column.nullable ? !notNull : undefined,
    default:
      column == null || def === (column.default_expr ?? "")
        ? undefined
        : def.trim() === ""
          ? "drop"
          : { kind: "raw", value: def },
  };

  let sql: string | null = null;
  let problem: string | null = null;
  try {
    sql = column
      ? mode === "drop"
        ? dropColumn(schema, table, column.name, columnCount)
        : alterColumn(schema, table, column.name, change, types)
      : null;
  } catch (e) {
    problem = e instanceof Error ? e.message : "This change cannot be built.";
  }

  const open = (next: "alter" | "drop") => {
    setError(null);
    setMode(next);
  };

  const confirm = () =>
    start(async () => {
      if (!column) return;
      try {
        const res =
          mode === "drop"
            ? await dropColumnAction(projectRef, schema, table, column.name)
            : await alterColumnAction(projectRef, schema, table, column.name, change);
        if (!res.ok) {
          setError(res.reason);
          return;
        }
        setMode(null);
        onClose();
        router.refresh();
      } catch {
        // The action rejected rather than answering — a dropped connection, a redeployed server.
        // The statement may already have run, and on a path with no undo the wrong thing to imply
        // is that it did not.
        setError("The request failed before it answered. Reload and check the column before retrying.");
      }
    });

  return (
    <>
      <Sheet open={column !== null} onOpenChange={(next) => !next && onClose()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">
              {schema}.{table}.{column?.name}
            </SheetTitle>
            <SheetDescription>
              A change runs as one statement, so either all of it lands or none of it does.
            </SheetDescription>
          </SheetHeader>

          <ColumnEditFields
            name={name}
            setName={setName}
            type={type}
            setType={setType}
            types={types}
            notNull={notNull}
            setNotNull={setNotNull}
            def={def}
            setDef={setDef}
            usage={usage}
          />

          <SheetFooter className="flex-row justify-between">
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => open("drop")}
            >
              Drop column
            </Button>
            <Button size="sm" onClick={() => open("alter")}>
              Save changes
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DdlConfirm
        open={mode !== null}
        onOpenChange={(next) => !next && setMode(null)}
        action={mode === "drop" ? `Drop ${column?.name}` : "Apply changes"}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={table}
        sql={sql}
        problem={problem}
        warning={mode === "drop" ? <DropWarning usage={usage} /> : null}
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
