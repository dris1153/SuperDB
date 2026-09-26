"use client";

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
 * Asked once, after Postgres has refused the statement as a write.
 *
 * Same ordering as the table editor's confirm: the **project** first. SuperDB has several open at
 * once, and the wrong database is the mistake with no undo. What it cannot do is state how many rows
 * this affects — an arbitrary statement has no count to check — so it shows the statement itself
 * instead, which is the only honest thing available.
 */
export function RunConfirm({
  open,
  onOpenChange,
  projectName,
  projectRef,
  sql,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  projectRef: string;
  sql: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {/* Escape mid-write would hide the outcome of a statement already running. */}
      <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Run this as a write?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <div>
                Project <span className="text-foreground">{projectName}</span>{" "}
                <span className="font-mono text-xs text-subtle">{projectRef}</span>
              </div>
              <div className="text-subtle">
                This statement was refused by a read-only transaction, so it writes. Nothing has
                changed yet.
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-xs whitespace-pre-wrap">
          {sql}
        </pre>

        <p className="text-xs text-subtle">
          It runs as <span className="font-mono">postgres</span>, so row-level security does not
          apply. <span className="text-warn">There is no undo.</span>
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            // Called directly: Radix unmounts the content on Action click, which would cancel a
            // nested form submission mid-flight. Same reason as write-confirm.tsx.
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "Running…" : "Run write"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
