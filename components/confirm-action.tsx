"use client";

import { useState, useTransition } from "react";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";

/**
 * Generic confirmation around a server action that takes no arguments.
 *
 * The action is called directly rather than through a <form> inside the dialog: Radix closes the
 * dialog on Action click, which unmounts a nested form before it can submit — the confirm button
 * then appears to do nothing at all. preventDefault keeps the dialog open so the pending state is
 * visible until the action navigates away.
 */
export function ConfirmAction({
  action,
  title,
  description,
  confirmLabel,
  triggerLabel,
}: {
  action: () => Promise<void>;
  title: string;
  description: string;
  confirmLabel: string;
  triggerLabel: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="self-start">
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              setError(null);
              start(async () => {
                try {
                  await action();
                } catch (err) {
                  // A redirect throws by design and is not an error worth showing.
                  if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
                  setError(err instanceof Error ? err.message : "Something went wrong");
                }
              });
            }}
          >
            {pending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
