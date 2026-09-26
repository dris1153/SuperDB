"use client";

import { useState, useTransition } from "react";
import { SIGNING_ALGORITHMS, type SigningAlgorithm } from "@/lib/signing-keys";
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
import { cn } from "@/lib/utils";

type Result = { ok: true } | { ok: false; reason: string };

/** Two options and a paragraph each — a picker would hide the only thing worth reading. */
const ABOUT: Record<SigningAlgorithm, string> = {
  ES256: "Elliptic curve, NIST P-256. Short signatures and the default for new projects.",
  RS256:
    "RSA 2048. Larger signatures, and the one to pick if something downstream only speaks RSA.",
};

export function CreateStandbyDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSubmit: (algorithm: SigningAlgorithm) => Promise<Result>;
}) {
  const [algorithm, setAlgorithm] = useState<SigningAlgorithm>("ES256");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset on open rather than on close: the success path closes by flipping `open` and never goes
  // through Radix's `onOpenChange`.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setAlgorithm("ES256");
    setError(null);
  }

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await onSubmit(algorithm);
        if (result.ok) onOpenChange(false);
        else setError(result.reason);
      } catch {
        setError("Could not reach the server.");
      }
    });

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent onEscapeKeyDown={(e) => pending && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Create a standby key</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p className="text-subtle">
                A standby key signs nothing. It is published in this project&apos;s JWKS within
                about a minute, so clients can cache it before it ever signs — then rotating costs
                no failed verifications.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          {SIGNING_ALGORITHMS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setAlgorithm(option)}
              disabled={pending}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left transition-colors",
                algorithm === option
                  ? "border-foreground bg-muted"
                  : "border-border hover:bg-muted/60",
              )}
            >
              <div className="font-mono text-xs text-foreground">{option}</div>
              <div className="mt-0.5 text-xs text-subtle">{ABOUT[option]}</div>
            </button>
          ))}
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button disabled={pending} onClick={submit}>
            {pending ? "Creating…" : "Create standby key"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
