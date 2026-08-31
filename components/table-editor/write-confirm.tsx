"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import type { IncomingRef } from "@/lib/table-editor";
import { GuardedSchemaField, useGuardedSchema } from "./guarded-schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * The one gate every write goes through.
 *
 * It names the **project** first. SuperDB has several open at once, which is the risk a
 * single-project dashboard does not have — and the wrong project is the mistake with no undo.
 *
 * For `auth` and `storage` the user types the table name to proceed. Not a block: repairing one
 * broken `auth.users` row is a legitimate thing to need. Enough friction that it cannot be reflex.
 */
export function WriteConfirm({
  open,
  onOpenChange,
  action,
  projectName,
  projectRef,
  schema,
  table,
  affected,
  impact,
  busy,
  blocked,
  error,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** In plain words: "Delete 3 rows", "Update this row". */
  action: string;
  projectName: string;
  projectRef: string;
  schema: string;
  table: string;
  /** Null while the count is still being fetched, or when it could not be determined. */
  affected: number | null;
  /** Foreign keys pointing at this table — only meaningful for a delete. */
  impact?: IncomingRef[];
  busy: boolean;
  /** The caller knows the write cannot succeed as it stands — a value that will not parse. */
  blocked?: boolean;
  error: string | null;
  onConfirm: () => void;
  /** What is about to be written, when the user still has a say in it. */
  children?: React.ReactNode;
}) {
  const { guarded, typed, setTyped, ready } = useGuardedSchema(open, schema, table);

  // A confirmed count of zero means the rows are already gone. Confirming would run a statement that
  // matches nothing and report success, which is the dialog and the database agreeing on a lie.
  const nothingToDo = affected === 0;

  // restrict/no action cannot remove anything; the rest change or delete rows in another table.
  const spreading = (impact ?? []).filter((r) => r.on_delete !== "restrict" && r.on_delete !== "no action");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* Escape is the one way out that Radix handles itself, and letting it fire mid-write would
          hide the outcome of a statement that is already running. */}
      <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{action}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <div>
                Project <span className="text-foreground">{projectName}</span>{" "}
                <span className="font-mono text-xs text-subtle">{projectRef}</span>
              </div>
              <div>
                Table{" "}
                <span className="font-mono text-foreground">
                  {schema}.{table}
                </span>
              </div>
              <div>
                {affected == null ? (
                  <span className="text-subtle">Checking how many rows this affects…</span>
                ) : nothingToDo ? (
                  <span className="text-warn">
                    Nothing matches any more — already gone. Close and refresh.
                  </span>
                ) : (
                  <>
                    Affects{" "}
                    <span className="text-foreground tabular-nums">
                      {affected} row{affected === 1 ? "" : "s"}
                    </span>
                  </>
                )}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {children}

        {spreading.length > 0 ? (
          // The count above is the target table only. Neither it nor RETURNING can see past a
          // foreign key, so without this the dialog and the result would agree and both be wrong.
          <div className="space-y-1 rounded-md border border-warn/40 px-3 py-2 text-xs text-warn">
            <div className="flex items-center gap-1.5">
              <IconAlertTriangle size={13} stroke={1.5} />
              This also reaches other tables, which are not in the count above:
            </div>
            <ul className="space-y-0.5 pl-5">
              {spreading.map((r) => (
                <li key={r.constraint} className="font-mono">
                  {r.schema}.{r.table} — on delete {r.on_delete}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-xs text-subtle">
          The row may have changed since it was loaded — this matches on the primary key only.{" "}
          <span className="text-warn">There is no undo.</span>
        </p>

        {guarded ? (
          <GuardedSchemaField schema={schema} table={table} typed={typed} onChange={setTyped} />
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !ready || blocked || nothingToDo || affected == null}
            // Called directly rather than through a nested form: Radix unmounts the content on
            // Action click, which cancels a form submission mid-flight. Same reason as
            // `confirm-action.tsx`.
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "Working…" : action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
