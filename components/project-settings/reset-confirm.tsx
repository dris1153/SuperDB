"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";

/**
 * The confirm in front of a database password reset.
 *
 * Shaped like `table-editor/write-confirm.tsx` — project first, then what breaks, then a name to
 * type — but not built on it: that component's type-to-confirm matches a *table* name and only
 * engages for the `auth` and `storage` schemas, and it refuses to enable its button until a row
 * count has arrived. There is no row count here.
 *
 * **The four statements below are accurate in both directions.** Supabase's own services update
 * themselves, the poolers carry the old password for a few seconds, and what actually breaks is
 * anything outside this app holding a connection string. Overstating that would be its own failure:
 * a dialog that cries wolf is one people learn to click through, and this is the wrong one to learn
 * that on.
 */
export function ResetConfirm({
  open,
  onOpenChange,
  projectName,
  projectRef,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectName: string;
  projectRef: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");

  // Cleared when the dialog opens rather than when it closes: a success path closes by flipping
  // `open`, which never goes through Radix's `onOpenChange`, and the typed name would still be
  // standing the next time — the same trap `guarded-schema.tsx` documents.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setTyped("");
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset the database password</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <div>
                Project <span className="text-foreground">{projectName}</span>{" "}
                <span className="font-mono text-xs text-subtle">{projectRef}</span>
              </div>

              <ul className="space-y-1 text-xs text-subtle">
                <li>Anything outside this app using a connection string stops working until it is updated.</li>
                <li>The connection poolers keep accepting the old password for a few seconds.</li>
                <li>Supabase&apos;s own services — PostgREST, realtime, storage — update themselves.</li>
                <li>API keys, the service-role key and Studio access are unaffected.</li>
              </ul>

              <p className="text-warn">
                The current password is not stored anywhere by Supabase and cannot be recovered after
                this.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1">
          <label htmlFor="reset-confirm-name" className="text-xs text-subtle">
            Type <span className="text-foreground">{projectName}</span> to confirm
          </label>
          <Input
            id="reset-confirm-name"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
            autoComplete="off"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy || typed !== projectName}
            onClick={(e) => {
              // The dialog stays open while the reset runs: its outcome is reported here, and one of
              // the outcomes is a password the user has to copy before anything closes.
              e.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "Resetting…" : "Reset password"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
