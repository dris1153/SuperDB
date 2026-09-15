"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * Both naming jobs are the same dialog: save a new query, or rename an existing one.
 *
 * Mounted per question by the caller rather than kept around with `open=false`, so the field starts
 * from `initial` without an effect resetting it — which is also what the lint rule against setting
 * state in an effect is asking for.
 */
export function NameDialog({
  open,
  onOpenChange,
  title,
  initial,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initial: string;
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Saved for this project only.</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() !== "") onSubmit(name.trim());
          }}
        >
          <Input
            autoFocus
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            placeholder="Untitled query"
          />
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}

          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || name.trim() === ""}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
