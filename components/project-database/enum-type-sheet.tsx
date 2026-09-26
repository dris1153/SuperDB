"use client";

import { useState, useTransition } from "react";
import { IconAlertCircle, IconArrowUpRight, IconPlus } from "@tabler/icons-react";
import { createEnumSql, updateEnumSql, type EnumType } from "@/lib/enum-statements";
import { createEnum, updateEnum } from "@/lib/enum-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DdlConfirm } from "@/components/table-editor/ddl-confirm";
import { useRefreshTable } from "@/components/table-editor/use-refresh-table";
import { EnumValues, type EnumItem } from "./enum-values";

let nextId = 0;
const item = (value: string, locked: boolean): EnumItem => ({ id: `v${++nextId}`, value, locked });

/** Create (`type` null) or update one enumerated type, as the original's side panel does. */
export function EnumTypeSheet({
  open,
  type,
  onClose,
  projectRef,
  projectName,
  schema,
}: {
  open: boolean;
  type: EnumType | null;
  onClose: () => void;
  projectRef: string;
  projectName: string;
  schema: string;
}) {
  const refresh = useRefreshTable(projectRef);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [items, setItems] = useState<EnumItem[]>([]);
  const [seeded, setSeeded] = useState<{ open: boolean; type: EnumType | null } | null>(null);
  if (open && (!seeded || !seeded.open || seeded.type !== type)) {
    setSeeded({ open, type });
    setName(type?.name ?? "");
    setComment(type?.comment ?? "");
    setItems(type ? type.values.map((v) => item(v, true)) : [item("", false)]);
  }

  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const added = items.filter((i) => !i.locked).map((i) => i.value.trim());
  let sql: string | null = null;
  let problem: string | null = null;
  try {
    sql = type
      ? updateEnumSql(schema, type, { name, comment, added })
      : createEnumSql(schema, name, comment, items.map((i) => i.value.trim()));
  } catch (e) {
    problem = e instanceof Error ? e.message : "This type cannot be built.";
  }

  const close = () => {
    setSeeded(null);
    setConfirming(false);
    setError(null);
    onClose();
  };

  const confirm = () =>
    start(async () => {
      try {
        const res = type
          ? await updateEnum(projectRef, schema, type.name, { name, comment, added })
          : await createEnum(projectRef, schema, name, comment, items.map((i) => i.value.trim()));
        if (!res.ok) return setError(res.reason);
        close();
        refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the types.");
      }
    });

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && close()}>
        <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg!">
          <SheetHeader className="border-b border-border px-6 py-4">
            <SheetTitle className="text-base font-normal">
              {type ? <>Update type <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{type.name}</code></> : "Create a new enumerated type"}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-5 px-6 py-6">
            <label className="block space-y-1.5">
              <span className="text-sm text-foreground">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-foreground">Description</span>
              <Input value={comment} onChange={(e) => setComment(e.target.value)} className="h-9" />
              <span className="block text-sm text-muted-foreground">Optional</span>
            </label>

            <div className="space-y-2">
              <span className="text-sm text-foreground">Values</span>
              <div className="flex gap-3 rounded-lg border border-border bg-muted/30 p-4">
                <IconAlertCircle size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="space-y-2">
                  <div className="text-sm text-foreground">
                    {type ? "Existing values cannot be deleted or sorted" : "After creation, values cannot be deleted or sorted"}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    You will need to delete and recreate the enumerated type with the updated values instead.
                  </p>
                  <Button asChild variant="outline" size="sm" className="gap-1.5">
                    <a href="https://www.postgresql.org/message-id/21012.1459434338%40sss.pgh.pa.us" target="_blank" rel="noreferrer">
                      <IconArrowUpRight size={14} /> Learn more
                    </a>
                  </Button>
                </div>
              </div>
              <EnumValues items={items} onChange={setItems} sortable={!type} />
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setItems([...items, item("", false)])}>
                <IconPlus size={14} /> Add value
              </Button>
            </div>
          </div>

          <SheetFooter className="mt-auto flex-row items-center justify-end gap-2 border-t border-border px-6 py-3">
            {problem && (name || items.some((i) => i.value)) ? <span className="mr-auto text-xs text-subtle">{problem}</span> : null}
            <Button variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button size="sm" disabled={!sql} onClick={() => { setError(null); setConfirming(true); }}>
              {type ? "Update type" : "Create type"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <DdlConfirm
        open={confirming}
        onOpenChange={setConfirming}
        action={type ? `Update type ${type.name}` : "Create type"}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={type?.name ?? name}
        sql={sql}
        problem={problem}
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
