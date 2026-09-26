"use client";

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
 * The confirm in front of a rotation.
 *
 * It reassures. Every other confirm in this app warns, and writing this one as a warning would
 * teach people to avoid the safe half of the lifecycle and leave an old key signing forever.
 * Measured 2026-09-25: promoting is one request, the outgoing key demotes itself and stays in JWKS,
 * and no session ends.
 */
export function RotateConfirm({
  open,
  onOpenChange,
  algorithm,
  outgoing,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  algorithm: string;
  outgoing: string | null;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign with the {algorithm} standby key</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <ul className="space-y-1 text-xs text-subtle">
                <li>New tokens are signed by the standby key from now on.</li>
                <li>
                  {outgoing ? (
                    <>
                      The current {outgoing} key moves to{" "}
                      <span className="font-mono">previously_used</span> and stays published, so
                      every token it signed keeps working until it expires.
                    </>
                  ) : (
                    <>The key in use moves aside and stays published until its tokens expire.</>
                  )}
                </li>
                <li>Nobody is signed out.</li>
              </ul>

              <p className="text-subtle">
                Revoking the outgoing key is what breaks tokens, and that is a separate step you can
                take once they have expired.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button disabled={busy} onClick={onConfirm}>
            {busy ? "Rotating…" : "Rotate keys"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Deleting a revoked key.
 *
 * Lighter than the revoke it follows: the key already verifies nothing, so this removes a row. The
 * API refuses for thirty days afterwards and names the date, which is why there is no countdown
 * here — press it and read the answer.
 */
export function DeleteSigningKeyConfirm({
  open,
  onOpenChange,
  algorithm,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  algorithm: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this revoked {algorithm} key</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-subtle">
              <p>
                It already verifies nothing, so this only removes the record of it. Supabase keeps
                revoked keys for a while and will say so if it is too soon.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? "Deleting…" : "Delete key"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
