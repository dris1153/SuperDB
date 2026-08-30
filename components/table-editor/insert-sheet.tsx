"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@tabler/icons-react";
import { insertRows } from "@/lib/write-actions";
import type { ColumnInfo } from "@/lib/table-view";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { parseValue } from "@/lib/cell-value";
import { ValueInput } from "./value-input";
import { WriteConfirm } from "./write-confirm";

/**
 * A form built from the column list.
 *
 * Touched state is tracked per field rather than reading an empty input as null: leaving a column
 * alone must mean *use its default*, and those are different things. A column nobody fills is left
 * out of the statement entirely, which is the only way DEFAULT applies at all.
 *
 * Generated and identity-always columns are omitted rather than disabled — the database will not
 * accept a value for them.
 */
export function InsertSheet({
  open,
  onOpenChange,
  projectRef,
  projectName,
  schema,
  table,
  columns,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
  columns: ColumnInfo[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const writable = columns.filter((c) => !c.generated);
  const touched = Object.keys(draft);

  const close = () => {
    setDraft({});
    setError(null);
    onOpenChange(false);
  };

  const submit = () =>
    start(async () => {
      setError(null);
      const row: Record<string, unknown> = {};
      for (const name of touched) {
        const column = columns.find((c) => c.name === name)!;
        const parsed = parseValue(column, draft[name]);
        if ("error" in parsed) {
          setError(parsed.error);
          setConfirming(false);
          return;
        }
        row[name] = parsed.value;
      }

      const result = await insertRows(projectRef, schema, table, [row]);
      if (!result.ok) {
        setError(result.reason);
        setConfirming(false);
        return;
      }
      setConfirming(false);
      close();
      router.refresh();
    });

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">
              Insert into {schema}.{table}
            </SheetTitle>
            <SheetDescription>
              Fields you leave alone keep their column default. Clearing one you have touched writes
              null.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4 pb-6">
            {writable.map((c) => (
              <div key={c.name} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground">{c.name}</span>
                  <span className="font-mono text-[11px] text-subtle">{c.short_type}</span>
                  {c.nullable ? null : <span className="text-[10px] text-warn">required</span>}
                  {c.name in draft ? (
                    <button
                      onClick={() =>
                        setDraft((d) => {
                          const next = { ...d };
                          delete next[c.name];
                          return next;
                        })
                      }
                      className="ml-auto text-[11px] text-subtle hover:text-foreground"
                    >
                      use default
                    </button>
                  ) : c.default_expr ? (
                    <span className="ml-auto font-mono text-[11px] text-subtle">
                      {c.default_expr.slice(0, 40)}
                    </span>
                  ) : null}
                </div>
                <ValueInput
                  column={c}
                  value={draft[c.name] ?? ""}
                  disabled={busy}
                  onChange={(v) => setDraft((d) => ({ ...d, [c.name]: v }))}
                />
              </div>
            ))}

            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <Button
              className="w-full gap-1"
              disabled={busy || touched.length === 0}
              onClick={() => setConfirming(true)}
            >
              <IconPlus size={14} stroke={1.5} />
              {touched.length === 0 ? "Fill at least one field" : "Insert row"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <WriteConfirm
        open={confirming}
        onOpenChange={setConfirming}
        action="Insert row"
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={table}
        affected={1}
        busy={busy}
        error={error}
        onConfirm={submit}
      />
    </>
  );
}

