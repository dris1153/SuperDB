"use client";

import { useState, useTransition } from "react";
import { nameProblem } from "@/lib/api-keys";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Creating a key, or renaming one.
 *
 * The name rule is checked as you type — 4-64 characters, lowercase letters, digits and underscores,
 * starting with a letter or an underscore — because it is the kind of rule nobody guesses and the
 * API states it only after a round trip. It is a convenience, not the boundary: the action checks it
 * again, and the API's own message wins when they disagree.
 */
export function KeyForm({
  open,
  onOpenChange,
  title,
  submitLabel,
  initialName = "",
  initialDescription = "",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  submitLabel: string;
  initialName?: string;
  initialDescription?: string;
  onSubmit: (name: string, description: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cleared when the dialog opens rather than when it closes: a success path closes by flipping
  // `open`, which never goes through Radix's `onOpenChange` — the trap `guarded-schema.tsx` documents.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setName(initialName);
    setDescription(initialDescription);
    setError(null);
  }

  const problem = name.trim() === "" ? null : nameProblem(name.trim());

  const submit = () =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await onSubmit(name, description);
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
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            A name identifies the key in this list and in Supabase. It cannot be changed to a type it
            was not created as.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="key-name" className="text-xs text-subtle">
              Name
            </label>
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              autoComplete="off"
              placeholder="web_app"
            />
            {problem ? <p className="text-xs text-warn">{problem}</p> : null}
          </div>

          <div className="space-y-1">
            <label htmlFor="key-description" className="text-xs text-subtle">
              Description <span className="text-subtle/70">— optional</span>
            </label>
            <Input
              id="key-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={pending}
              autoComplete="off"
            />
          </div>

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending || name.trim() === "" || problem !== null}
            onClick={(e) => {
              // The dialog stays open while the request runs, so a refusal is reported where the
              // field that caused it still is.
              e.preventDefault();
              submit();
            }}
          >
            {pending ? "Working…" : submitLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Deleting a key.
 *
 * No type-the-name friction here, unlike the database password reset: that one destroys something
 * unrecoverable across a whole project, while this breaks whatever uses one key — serious, bounded,
 * and visible immediately. The name is stated so the wrong row cannot be deleted by muscle memory.
 */
export function DeleteKeyConfirm({
  open,
  onOpenChange,
  name,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  name: string;
  onConfirm: () => void;
}) {
  const [pending, setPending] = useState(false);

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm">
              <p>
                Anything authenticating with this key stops working immediately, and it cannot be
                restored — a replacement is a different key.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => {
              setPending(true);
              onConfirm();
            }}
          >
            {pending ? "Deleting…" : "Delete key"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
