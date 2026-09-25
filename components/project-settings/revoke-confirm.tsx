"use client";

import { useState } from "react";
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
import { Input } from "@/components/ui/input";

/**
 * The confirm in front of a revocation.
 *
 * The only irreversible-in-effect action on this page. A retired key still verifies what it signed;
 * this withdraws it, and every unexpired token it signed stops being accepted at once.
 *
 * **It says two different things, because the two cases are not alike.** An asymmetric key is
 * published in JWKS and its tokens expire on the project's `jwt_exp`, so there is a wait after which
 * revoking is safe. The legacy HS256 secret is not in JWKS at all — symmetric, no public half — and
 * the tokens hanging off it are `anon` and `service_role`, which do not expire on that schedule.
 * Printing the `jwt_exp` wait next to the legacy warning would offer a waiting period that does not
 * exist, which is the one mistake on this page with a consequence.
 *
 * Carries the type-the-project-name friction the database password reset and the legacy API keys
 * switch use, for the same reason: the cost of the mistake is not visible from the button.
 */
export function RevokeConfirm({
  open,
  onOpenChange,
  projectName,
  algorithm,
  lifetime,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectName: string;
  algorithm: string;
  lifetime: string;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");

  // Keyed on the algorithm rather than on the key being *the* legacy secret. HS256 is in the create
  // enum, so a project could in principle hold a second one; over-warning is the safe direction.
  const legacy = algorithm === "HS256";

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setTyped("");
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {legacy ? "Revoke the legacy JWT secret" : `Revoke this ${algorithm} key`}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {legacy ? (
                <>
                  <ul className="space-y-1 text-xs text-subtle">
                    <li>
                      <span className="font-mono">anon</span> and{" "}
                      <span className="font-mono">service_role</span> are tokens signed by this
                      secret. Revoking it stops both of them verifying, immediately, including in
                      applications you do not control.
                    </li>
                    <li>
                      Unlike the asymmetric keys, this one is not published in JWKS — it is symmetric
                      and has no public half — so only Supabase ever verified with it.
                    </li>
                  </ul>

                  <p className="text-destructive">
                    Those two keys are long-lived and do not expire on this project&apos;s token
                    schedule, so there is no waiting period that makes this safe. Turn them off on
                    the API Keys page first, and be sure nothing is still using them.
                  </p>
                </>
              ) : (
                <>
                  <ul className="space-y-1 text-xs text-subtle">
                    <li>
                      It is removed from this project&apos;s JWKS, so anything verifying tokens
                      against that endpoint stops accepting the ones it signed.
                    </li>
                    <li>
                      Unexpired tokens signed by it stop being accepted immediately — not at the next
                      sign-in.
                    </li>
                  </ul>

                  <p className="text-warn">
                    Tokens on this project last {lifetime}. If this key was rotated out more recently
                    than that, sessions are still relying on it.
                  </p>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1">
          <label htmlFor="revoke-confirm" className="text-xs text-subtle">
            Type <span className="text-foreground">{projectName}</span> to confirm
          </label>
          <Input
            id="revoke-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
            autoComplete="off"
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy || typed !== projectName} onClick={onConfirm}>
            {busy ? "Revoking…" : "Revoke key"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
