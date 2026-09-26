"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
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
 * The gate for a schema change.
 *
 * A row write can say how many rows it will touch. DDL cannot — there is nothing to count — so the
 * preview *is* the statement, shown in full. That is also why the SQL is worth showing at all: the
 * server rebuilds it from the same inputs rather than running what the browser composed, so this is
 * the one place where what will happen can be read literally.
 *
 * `problem` is for the statement that cannot be built at all — an unknown type, an empty name. It
 * takes the place of the SQL rather than sitting beside it, because there is nothing to preview.
 */
export function DdlConfirm({
  open,
  onOpenChange,
  action,
  projectName,
  projectRef,
  schema,
  table,
  sql,
  problem,
  warning,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** In plain words: "Create table", "Drop column status". */
  action: string;
  projectName: string;
  projectRef: string;
  schema: string;
  table: string;
  /** Exactly what the server will build from the same inputs. */
  sql: string | null;
  /** Why no statement could be built. Mutually exclusive with `sql`. */
  problem?: string | null;
  /** What this change costs — rows that hold a value, policies that stop being enforced. */
  warning?: React.ReactNode;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const { guarded, typed, setTyped, ready } = useGuardedSchema(open, schema, table);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-2xl"
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{action}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <div>
                Project <span className="text-foreground">{projectName}</span>{" "}
                <span className="font-mono text-xs text-subtle">{projectRef}</span>
              </div>
              <div>
                Schema <span className="font-mono text-foreground">{schema}</span>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {problem ? (
          <p className="rounded-md border border-destructive/40 px-3 py-2 text-xs text-destructive">
            {problem}
          </p>
        ) : (
          <pre className="max-h-64 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs whitespace-pre-wrap">
            {sql}
          </pre>
        )}

        {warning ? (
          <div className="flex gap-1.5 rounded-md border border-warn/40 px-3 py-2 text-xs text-warn">
            <IconAlertTriangle size={13} stroke={1.5} className="mt-0.5 shrink-0" />
            <div className="space-y-1">{warning}</div>
          </div>
        ) : null}

        <p className="text-xs text-subtle">
          This runs as <span className="font-mono">postgres</span>.{" "}
          <span className="text-warn">There is no undo.</span>
        </p>

        {guarded ? (
          <GuardedSchemaField schema={schema} table={table} typed={typed} onChange={setTyped} />
        ) : null}

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || !ready || sql == null}
            // Called directly rather than through a nested form: Radix unmounts the content on
            // Action click, which cancels a form submission mid-flight.
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
