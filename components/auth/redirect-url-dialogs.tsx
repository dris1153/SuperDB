"use client";

import { useState, useTransition } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { splitPasted, withAdded } from "@/lib/auth-urls";
import { addRedirectUrls, removeRedirectUrls } from "@/lib/auth-url-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
/** Measured with the OAuth Server's fields: GoTrue picks a config change up about a minute later. */
export const TAKES_A_MINUTE = "It takes about a minute to take effect.";

const plural = (n: number) => `${n} URL${n === 1 ? "" : "s"}`;

/** The original's Add dialog: one row to start, more on demand or on paste, a reason per row. */
export function AddUrlsDialog({ projectRef, existing, open, onOpenChange, onSaved }: {
  projectRef: string;
  existing: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState([""]);
  const [problems, setProblems] = useState<(string | null)[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const reset = () => { setRows([""]); setProblems([]); setError(null); };
  // Reasons are kept by row index, so any change to the rows clears them rather than misplace them.
  const edit = (next: string[]) => { setRows(next); setProblems([]); setError(null); };
  const set = (i: number, value: string) => edit(rows.map((r, j) => (j === i ? value : r)));

  // Several URLs pasted into one row become rows of their own, as the original splits them.
  const paste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const parts = splitPasted(e.clipboardData.getData("text"));
    if (parts.length < 2) return;
    e.preventDefault();
    const next = [...rows.slice(0, i), ...parts, ...rows.slice(i + 1)].filter(Boolean);
    edit(next.length ? next : [""]);
  };

  const save = () =>
    start(async () => {
      const checked = withAdded(existing, rows);
      setProblems(checked.ok ? [] : checked.rows);
      setError(checked.ok || checked.rows.some(Boolean) ? null : checked.reason);
      if (!checked.ok) return;
      const result = await addRedirectUrls(projectRef, rows);
      if (!result.ok) return setError(result.reason);
      toast.success(`Successfully added ${plural(rows.length)}`, { description: TAKES_A_MINUTE });
      reset();
      onOpenChange(false);
      onSaved();
    });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        {/* A form, so Enter in a row saves, as the original's does. */}
        <form className="contents" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <DialogHeader>
          <DialogTitle>Add new redirect URLs</DialogTitle>
          <DialogDescription>
            This will add a URL to a list of allowed URLs that can interact with your Authentication services for
            this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div>
            <div className="text-sm text-foreground">URL</div>
            <p className="text-sm text-muted-foreground">Paste multiple URLs at once — one per line</p>
          </div>
          <div className="max-h-64 space-y-2 overflow-y-auto p-0.5">
            {rows.map((row, i) => (
              <div key={i} className="space-y-1">
                <div className="flex gap-2">
                  <Input value={row} onChange={(e) => set(i, e.target.value)} onPaste={(e) => paste(i, e)}
                    placeholder="https://mydomain.com" aria-label={`URL ${i + 1}`} aria-invalid={!!problems[i]}
                    autoFocus={i === rows.length - 1} />
                  {rows.length > 1 ? (
                    <Button type="button" variant="outline" size="icon" aria-label="Remove URL" onClick={() => edit(rows.filter((_, j) => j !== i))}>
                      <IconTrash size={14} />
                    </Button>
                  ) : null}
                </div>
                {problems[i] ? <p className="text-sm text-destructive">{problems[i]}</p> : null}
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => edit([...rows, ""])}>
            <IconPlus size={14} /> Add URL
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Saving…" : "Save URLs"}</Button>
        </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The original's confirm, listing what goes. */
export function RemoveUrlsDialog({ projectRef, urls, open, onOpenChange, onSaved }: {
  projectRef: string;
  urls: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const remove = () =>
    start(async () => {
      setError(null);
      const result = await removeRedirectUrls(projectRef, urls);
      if (!result.ok) return setError(result.reason);
      toast.success(`Successfully removed ${plural(urls.length)}`, { description: TAKES_A_MINUTE });
      onOpenChange(false);
      onSaved();
    });

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) setError(null); onOpenChange(next); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove URLs</AlertDialogTitle>
          <AlertDialogDescription>Are you sure you want to remove the following {plural(urls.length)}?</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="max-h-60 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {urls.map((url) => <li key={url} className="truncate px-4 py-2.5 font-mono text-sm text-foreground" title={url}>{url}</li>)}
        </ul>
        <p className="text-sm text-muted-foreground">These URLs will no longer work with your authentication configuration.</p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {/* preventDefault: Radix would close on click and unmount the pending state with it. */}
          <AlertDialogAction variant="destructive" disabled={busy} onClick={(e) => { e.preventDefault(); remove(); }}>
            {busy ? "Removing…" : urls.length === 1 ? "Remove URL" : "Remove URLs"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
