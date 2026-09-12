"use client";

import type { SavedQuery } from "@/lib/saved-queries";
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
import { NameDialog } from "./name-dialog";

/**
 * The four questions the sidebar can ask, as one state rather than four booleans — two of them can
 * never be open at once, and separate flags would let them be.
 *
 * `discard` carries what to open next, `null` meaning a new empty query. Without it, confirming
 * would have to guess what the user had clicked.
 */
export type QueryDialog =
  | { kind: "save-as" }
  | { kind: "rename"; query: SavedQuery }
  | { kind: "delete"; query: SavedQuery }
  | { kind: "discard"; next: SavedQuery | null };

export function QueryDialogs({
  dialog,
  busy,
  error,
  onClose,
  onName,
  onDelete,
  onDiscard,
}: {
  dialog: QueryDialog | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  /** Save under a new name, or rename the one in the dialog. */
  onName: (name: string) => void;
  onDelete: (query: SavedQuery) => void;
  onDiscard: (next: SavedQuery | null) => void;
}) {
  const naming = dialog?.kind === "save-as" || dialog?.kind === "rename";

  return (
    <>
      {naming ? (
        <NameDialog
          // Keyed by the question, so reopening on a different query starts from that query's name.
          key={dialog.kind === "rename" ? dialog.query.id : "save-as"}
          open
          onOpenChange={(open) => !open && onClose()}
          title={dialog.kind === "rename" ? "Rename query" : "Save query"}
          initial={dialog.kind === "rename" ? dialog.query.name : ""}
          busy={busy}
          error={error}
          onSubmit={onName}
        />
      ) : null}

      <AlertDialog open={dialog?.kind === "delete"} onOpenChange={(open) => !open && !busy && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{dialog?.kind === "delete" ? dialog.query.name : ""}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The query is removed from this project. The database is not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              // Directly, not through a form: Radix unmounts the content on click, which cancels a
              // nested submission mid-flight. Same reason as write-confirm.tsx.
              onClick={(e) => {
                e.preventDefault();
                if (dialog?.kind === "delete") onDelete(dialog.query);
              }}
            >
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog?.kind === "discard"} onOpenChange={(open) => !open && onClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The editor has changes that are not saved to any query. Opening another one replaces
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (dialog?.kind === "discard") onDiscard(dialog.next);
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
