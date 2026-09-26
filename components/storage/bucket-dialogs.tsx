"use client";

import { useState, useTransition } from "react";
import { bucketNameProblem } from "@/lib/buckets";
import { fromBytes, SIZE_UNITS, sizeProblem, toBytes, type SizeUnit } from "@/lib/storage-config";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Result = { ok: true } | { ok: false; reason: string };

export type BucketSettings = {
  isPublic: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
};

/**
 * Creating a bucket, or editing one.
 *
 * The three switches reveal their inputs, as in the original: a limit and a MIME list only exist
 * when they are turned on, and `null` is what the API takes for "no restriction" — not zero, and
 * not an empty array.
 *
 * **The name is fixed at creation** and the dialog says so, because the API offers no rename and
 * discovering that after typing one is worse than being told.
 */
export function BucketForm({
  open,
  onOpenChange,
  title,
  submitLabel,
  name: fixedName,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  submitLabel: string;
  /** Given when editing, since the name cannot change. */
  name?: string;
  initial?: BucketSettings;
  onSubmit: (name: string, settings: BucketSettings) => Promise<Result>;
}) {
  const [name, setName] = useState(fixedName ?? "");
  const [isPublic, setPublic] = useState(initial?.isPublic ?? false);

  const seed = fromBytes(initial?.fileSizeLimit ?? undefined);
  const [limited, setLimited] = useState(initial?.fileSizeLimit != null);
  const [size, setSize] = useState(initial?.fileSizeLimit ? String(seed.value) : "50");
  const [unit, setUnit] = useState<SizeUnit>(initial?.fileSizeLimit ? seed.unit : "MB");

  const [restricted, setRestricted] = useState((initial?.allowedMimeTypes?.length ?? 0) > 0);
  const [mime, setMime] = useState((initial?.allowedMimeTypes ?? []).join(", "));

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Reset on open rather than on close: the success path closes by flipping `open` and never goes
  // through Radix's `onOpenChange`.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setName(fixedName ?? "");
    setPublic(initial?.isPublic ?? false);
    setLimited(initial?.fileSizeLimit != null);
    // Seeded from the bucket, not left at the default: opening Edit on a bucket limited to 1 MB
    // used to show 50 MB with the switch already on, so saving without touching anything raised the
    // limit fiftyfold.
    setSize(initial?.fileSizeLimit ? String(fromBytes(initial.fileSizeLimit).value) : "50");
    setUnit(initial?.fileSizeLimit ? fromBytes(initial.fileSizeLimit).unit : "MB");
    setRestricted((initial?.allowedMimeTypes?.length ?? 0) > 0);
    setMime((initial?.allowedMimeTypes ?? []).join(", "));
    setError(null);
  }

  const nameProblem = fixedName ? null : name.trim() === "" ? null : bucketNameProblem(name.trim());
  const limitProblem = limited ? sizeProblem(Number(size), unit) : null;
  const ready = !pending && (fixedName || name.trim() !== "") && !nameProblem && !limitProblem;

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const types = mime
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      try {
        const result = await onSubmit(fixedName ?? name.trim(), {
          isPublic,
          fileSizeLimit: limited ? toBytes(Number(size), unit) : null,
          allowedMimeTypes: restricted && types.length ? types : null,
        });
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
          <AlertDialogDescription className="sr-only">
            Name the bucket and choose whether it is public, size limited or restricted by type.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="bucket-name" className="text-sm text-foreground">
                Bucket name
              </label>
              <span className="text-xs text-subtle">Cannot be changed after creation</span>
            </div>
            <Input
              id="bucket-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending || !!fixedName}
              placeholder="Enter bucket name"
              autoComplete="off"
            />
            {nameProblem ? <p className="text-xs text-warn">{nameProblem}</p> : null}
          </div>

          <Option
            label="Public bucket"
            hint="Allow anyone to read objects without authorization"
            checked={isPublic}
            onChange={setPublic}
            disabled={pending}
          />

          <Option
            label="Restrict file size"
            hint="Prevent uploading of files larger than a specified limit"
            checked={limited}
            onChange={setLimited}
            disabled={pending}
          >
            <div className="flex items-center gap-2">
              <Input
                value={size}
                onChange={(e) => setSize(e.target.value)}
                disabled={pending}
                inputMode="numeric"
                aria-label="File size limit"
                className="w-28"
              />
              <Select value={unit} onValueChange={(u) => setUnit(u as SizeUnit)} disabled={pending}>
                <SelectTrigger className="w-28" aria-label="Unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIZE_UNITS.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {limitProblem ? <p className="mt-1 text-xs text-warn">{limitProblem}</p> : null}
          </Option>

          <Option
            label="Restrict MIME types"
            hint="Allow only certain types of files to be uploaded"
            checked={restricted}
            onChange={setRestricted}
            disabled={pending}
          >
            <Input
              value={mime}
              onChange={(e) => setMime(e.target.value)}
              disabled={pending}
              placeholder="image/png, text/plain"
              aria-label="Allowed MIME types"
            />
          </Option>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button disabled={!ready} onClick={submit}>
            {pending ? "Working…" : submitLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Option({
  label,
  hint,
  checked,
  onChange,
  disabled,
  children,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-start gap-3">
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground">{label}</div>
          <p className="mt-0.5 text-xs text-subtle">{hint}</p>
        </div>
      </div>
      {checked ? children : null}
    </div>
  );
}

/**
 * Deleting a bucket.
 *
 * The API refuses while objects remain, with a message that says so plainly, so this does not count
 * them first — it offers to remove them and lets the refusal speak for itself otherwise. Emptying
 * through `/bucket/{id}/empty` is asynchronous and would not help: measured, it queues the work and
 * the delete that follows still fails.
 */
export function DeleteBucketConfirm({
  open,
  onOpenChange,
  name,
  busy,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  name: string;
  busy: boolean;
  error: string | null;
  onConfirm: (withContents: boolean) => void;
}) {
  const [typed, setTyped] = useState("");
  const [withContents, setWithContents] = useState(false);

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setTyped("");
    setWithContents(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <AlertDialogContent onEscapeKeyDown={(e) => busy && e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {name}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p className="text-subtle">
                Anything reading from this bucket stops working, and Storage has no undo.
              </p>

              <Option
                label="Delete the files inside it too"
                hint="Without this, a bucket that still holds files cannot be removed."
                checked={withContents}
                onChange={setWithContents}
                disabled={busy}
              />
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1">
          <label htmlFor="bucket-confirm" className="text-xs text-subtle">
            Type <span className="text-foreground">{name}</span> to confirm
          </label>
          <Input
            id="bucket-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={busy}
            autoComplete="off"
          />
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <Button variant="destructive" disabled={busy || typed !== name} onClick={() => onConfirm(withContents)}>
            {busy ? "Deleting…" : "Delete bucket"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
