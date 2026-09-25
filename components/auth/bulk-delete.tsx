"use client";

import { useState, useTransition } from "react";
import { IconTrash, IconX } from "@tabler/icons-react";
import { toast } from "sonner";
import { deleteProjectUsers, type BulkResult } from "@/lib/auth-user-actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/**
 * The bar that appears once rows are selected, and the confirm behind its delete.
 *
 * **Deleting one asks for the email typed out; deleting five does not.** Typing five addresses is
 * friction that gets clicked through rather than read, so this shows the list instead and says the
 * count twice — in the button and in the sentence.
 *
 * There is no transaction. The action deletes one at a time and reports each outcome, so a batch
 * where two failed says exactly that: the other three are gone and no amount of retrying brings
 * them back.
 */
export function BulkDeleteBar({
  projectRef,
  selected,
  labels,
  onClear,
  onDone,
}: {
  projectRef: string;
  selected: string[];
  /** Email or id, for the confirm — what a person recognises, not what the API keys on. */
  labels: Map<string, string>;
  onClear: () => void;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [failures, setFailures] = useState<BulkResult["failed"]>([]);
  const [busy, start] = useTransition();

  if (selected.length === 0) return null;

  const remove = () =>
    start(async () => {
      setFailures([]);
      const answer = await deleteProjectUsers(projectRef, selected);

      if (!answer.ok) {
        setFailures([{ id: "", reason: answer.reason }]);
        return;
      }

      const { deleted, failed } = answer.result;
      if (deleted.length > 0) {
        toast.success(`Deleted ${deleted.length} ${deleted.length === 1 ? "user" : "users"}.`);
      }

      // The dialog stays open while anything failed: closing it would leave a toast as the only
      // record of which accounts are still there.
      if (failed.length === 0) {
        setOpen(false);
        onClear();
      } else {
        setFailures(failed);
      }

      onDone();
    });

  return (
    <>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        <span>
          {selected.length} {selected.length === 1 ? "user" : "users"} selected
        </span>

        <span className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-2" onClick={onClear}>
            <IconX className="size-4" />
            Clear
          </Button>
          <Button variant="destructive" size="sm" className="gap-2" onClick={() => setOpen(true)}>
            <IconTrash className="size-4" />
            Delete {selected.length}
          </Button>
        </span>
      </div>

      <AlertDialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
        <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {selected.length} {selected.length === 1 ? "user" : "users"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone, and there is no transaction — each account is deleted on its
              own, so a failure part way through leaves the earlier ones gone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-xs">
            {selected.map((id) => (
              <li key={id} className="truncate text-muted-foreground">
                {labels.get(id) ?? id}
              </li>
            ))}
          </ul>

          {failures.length > 0 ? (
            <div className="space-y-1 text-sm text-destructive">
              <p>{failures.length === 1 && !failures[0].id ? failures[0].reason : "Some were not deleted:"}</p>
              {failures
                .filter((f) => f.id)
                .map((f) => (
                  <p key={f.id} className="truncate text-xs">
                    {labels.get(f.id) ?? f.id} — {f.reason}
                  </p>
                ))}
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button variant="destructive" disabled={busy} onClick={remove}>
              Delete {selected.length}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
