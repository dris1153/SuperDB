"use client";

import { useState, useTransition } from "react";
import { setLegacyKeysEnabled } from "@/lib/api-key-actions";
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
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";

/**
 * The switch that stops this project issuing `anon` and `service_role`.
 *
 * One flag covers both; there is no per-key control. Disabling it is the widest-reaching action on
 * this page — `anon` is what nearly every client application authenticates with — so it carries the
 * type-the-project-name friction the database password reset uses.
 */
export function LegacyKeysSwitch({
  projectRef,
  projectName,
}: {
  projectRef: string;
  projectName: string;
}) {
  const state = useProjectPart<{ enabled: boolean }>(projectRef, "legacy-api-keys");
  const refetch = useRefetchPart(projectRef, "legacy-api-keys");
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const enabled = state.status === "ready" ? state.data?.enabled : undefined;

  const apply = (next: boolean) =>
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await setLegacyKeysEnabled(projectRef, next);
        if (!result.ok) return setMessage(result.reason);
        await refetch();
        setConfirming(false);
      } catch {
        setMessage("Could not reach the server.");
      }
    });

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm text-foreground">
            {enabled === false ? "Legacy API keys are disabled" : "Disable legacy API keys"}
          </h3>
          <p className="mt-0.5 text-xs text-subtle">
            {enabled === false
              ? "This project no longer issues anon or service_role."
              : "Make sure nothing is still using anon or service_role before proceeding."}
          </p>
        </div>

        {isWaiting(state) ? (
          <Skeleton className="h-8 w-44" />
        ) : state.status !== "ready" ? (
          <p className="text-xs text-subtle">{reasonOf(state)}</p>
        ) : enabled === false ? (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => apply(true)}>
            {pending ? "Working…" : "Re-enable legacy keys"}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setConfirming(true)}
            className="border-destructive/40 text-destructive"
          >
            Disable JWT-based API keys
          </Button>
        )}
      </div>

      {message ? <p className="text-xs text-destructive">{message}</p> : null}

      <DisableConfirm
        open={confirming}
        onOpenChange={(next) => !pending && setConfirming(next)}
        projectName={projectName}
        projectRef={projectRef}
        busy={pending}
        onConfirm={() => apply(false)}
      />
    </Card>
  );
}

function DisableConfirm({
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

  // Cleared when the dialog opens, not when it closes: the success path closes by flipping `open`
  // and never goes through Radix's `onOpenChange`, which would leave the name standing.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setTyped("");
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Disable legacy API keys</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <div>
                Project <span className="text-foreground">{projectName}</span>{" "}
                <span className="font-mono text-xs text-subtle">{projectRef}</span>
              </div>

              <ul className="space-y-1 text-xs text-subtle">
                <li>
                  <span className="font-mono">anon</span> stops working. It is what most client
                  applications authenticate with, so they stop too — immediately, not gradually.
                </li>
                <li>
                  <span className="font-mono">service_role</span> stops working, including anything
                  server-side still using it.
                </li>
                <li>Publishable and secret keys are unaffected.</li>
              </ul>

              {/* Re-enabling is one call, and saying so here would invite clicking through. It
                  restores the flag, not the requests that failed in between. */}
              <p className="text-warn">
                This takes effect at once. Turning it back on later does not undo what broke in
                between.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1">
          <label htmlFor="legacy-confirm" className="text-xs text-subtle">
            Type <span className="text-foreground">{projectName}</span> to confirm
          </label>
          <Input
            id="legacy-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
            autoComplete="off"
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy || typed !== projectName} onClick={onConfirm}>
            {busy ? "Disabling…" : "Disable legacy keys"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
