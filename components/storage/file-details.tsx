"use client";

import { useEffect, useState, useTransition } from "react";
import { IconDownload, IconLink, IconTrash, IconX } from "@tabler/icons-react";
import { deleteObjectsAt, objectUrl } from "@/lib/object-actions";
import { bytes as formatBytes } from "@/lib/format";
import { isPreviewable, joinPath, type StorageObject } from "@/lib/storage-objects";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/copy-button";

/**
 * What is known about one object, and the three things that can be done with it.
 *
 * A private object is read through a signed URL rather than proxied by this server: the signature
 * is minted for this view and expires, and the alternative would be streaming every preview through
 * a route handler for no gain. A public bucket needs no signature at all, and its URL is the one
 * worth copying — but **which of the two it is, the server decides**. Passing that judgement in
 * from a client-side cache would mean a stale entry choosing between a link that expires and one
 * that never does.
 */
export function FileDetails({
  projectRef,
  bucket,
  prefix,
  entry,
  onClose,
  onDeleted,
}: {
  projectRef: string;
  bucket: string;
  prefix: string;
  entry: StorageObject;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const path = joinPath(prefix, entry.name);
  const [url, setUrl] = useState<string | null>(null);
  const [isPublic, setPublic] = useState(false);
  // Separate from `url`: the URL arrives one round trip before the bytes do, and a preview that
  // appears the moment the link exists is a broken image for as long as the image takes.
  const [shown, setShown] = useState(false);
  const [broken, setBroken] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  // One signature per object viewed. Nothing is reset here because nothing needs to be: the browser
  // gives this component a `key` of the object's path, so another file mounts a new one, and the
  // dependencies below cannot change within a mount.
  useEffect(() => {
    let live = true;

    objectUrl(projectRef, bucket, path)
      .then((result) => {
        if (!live) return;
        if (result.ok) {
          setUrl(result.url);
          // A URL with no token in it is a public one, which is the only way this component can
          // tell — and it is the server's answer rather than a guess from a cached bucket list.
          setPublic(!result.url.includes("token="));
        } else {
          setProblem(result.reason);
        }
      })
      .catch(() => live && setProblem("Could not reach the server."));

    return () => {
      live = false;
    };
  }, [projectRef, bucket, path]);

  const remove = () =>
    startTransition(async () => {
      setProblem(null);
      try {
        const result = await deleteObjectsAt(projectRef, bucket, [path]);
        if (!result.ok) return setProblem(result.reason);
        if (result.removed === 0) return setProblem("Storage reported nothing removed.");
        onDeleted();
      } catch {
        setProblem("Could not reach the server.");
      }
    });

  return (
    <Card className="w-full shrink-0 space-y-4 p-4 lg:w-80">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-mono text-xs text-foreground">{entry.name}</div>
          <p className="mt-0.5 text-xs text-subtle">
            {entry.metadata?.mimetype ?? "unknown type"}
            {entry.metadata?.size != null ? ` — ${formatBytes(entry.metadata.size)}` : null}
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={onClose}>
          <IconX size={13} stroke={1.5} />
        </Button>
      </div>

      {isPreviewable(entry) ? (
        <div className="relative">
          {/* Held until the image itself has decoded, so the panel does not show an empty frame
              first and then jump. The skeleton keeps a shape while that happens. */}
          {!shown && !broken ? <Skeleton className="aspect-video w-full" /> : null}

          {broken ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-subtle">
              This file could not be previewed. It can still be downloaded.
            </p>
          ) : null}

          {url && !broken ? (
            /* A signed URL on a host next/image is not configured for, and one that changes per
               view, so there is nothing for the optimiser to cache. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={entry.name}
              onLoad={() => setShown(true)}
              // A signature that expired, or a file whose type says image and whose bytes do not.
              // Either way a broken-image glyph says less than a sentence does.
              onError={() => setBroken(true)}
              className={cn(
                "w-full rounded-md border border-border",
                shown ? null : "absolute inset-0 opacity-0",
              )}
            />
          ) : null}
        </div>
      ) : null}

      <dl className="space-y-1 text-xs">
        <Row label="Added on" value={entry.created_at} />
        <Row label="Last modified" value={entry.updated_at} />
      </dl>

      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {url ? (
          <Button variant="outline" size="sm" asChild>
            <a href={url} download={entry.name}>
              <IconDownload size={13} stroke={1.5} />
              Download
            </a>
          </Button>
        ) : (
          // Not the same button disabled: `asChild` needs exactly one element child, so the
          // pending state wrapped its icon and label in a span and the two wrapped onto separate
          // lines. A plain disabled button keeps the layout it will have when the link lands.
          <Button variant="outline" size="sm" disabled>
            <IconDownload size={13} stroke={1.5} />
            {problem ? "Unavailable" : "Preparing…"}
          </Button>
        )}

        {url ? <CopyButton value={url} /> : null}
        {url ? (
          <span className="self-center text-xs text-subtle">
            <IconLink size={11} stroke={1.5} className="inline" />{" "}
            {isPublic ? "Public URL" : "Signed for one hour"}
          </span>
        ) : null}
      </div>

      {confirming ? (
        <div className="space-y-2 rounded-md border border-destructive/40 p-3">
          <p className="text-xs text-foreground">
            Delete <span className="font-mono">{entry.name}</span>? Storage has no undo.
          </p>
          <div className="flex gap-2">
            <Button variant="destructive" size="sm" disabled={pending} onClick={remove}>
              {pending ? "Deleting…" : "Delete"}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="text-subtle hover:text-destructive"
          onClick={() => setConfirming(true)}
        >
          <IconTrash size={13} stroke={1.5} />
          Delete file
        </Button>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-subtle">{label}</dt>
      <dd className="text-muted-foreground">{new Date(value).toLocaleString()}</dd>
    </div>
  );
}
