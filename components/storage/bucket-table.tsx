"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { IconFolder, IconPlus, IconRefresh, IconSearch, IconSortDescending } from "@tabler/icons-react";
import { createBucket, deleteBucket, updateBucket } from "@/lib/bucket-actions";
import { describeLimit, describeMimeTypes, type BucketRow } from "@/lib/buckets";
import { bytes as formatBytes } from "@/lib/format";
import type { StorageConfig } from "@/lib/mgmt-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PILL } from "@/components/status";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { BucketForm, DeleteBucketConfirm, type BucketSettings } from "./bucket-dialogs";
import { cn } from "@/lib/utils";

/**
 * The buckets in this project, from its own Storage API.
 *
 * The Management API can list bucket names and nothing else — not whether one is public, not its
 * limits. Everything in this table past the name comes from a call that needs a project key, which
 * is why this tab could not exist before `lib/project-key.ts` did.
 */
export function BucketTable({ projectRef }: { projectRef: string }) {
  const state = useProjectPart<BucketRow[]>(projectRef, "buckets");
  const config = useProjectPart<StorageConfig>(projectRef, "storage-config");
  const refetch = useRefetchPart(projectRef, "buckets");

  const [search, setSearch] = useState("");
  const [newest, setNewest] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BucketRow | null>(null);
  const [deleting, setDeleting] = useState<BucketRow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The query's own array, not a fresh one per render: the sort below memoises on it, and a new
  // `[]` each time would re-sort on every keystroke elsewhere in the tree.
  const data = state.status === "ready" ? state.data : undefined;
  const all = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  // Undefined until the config lands, which `describeLimit` renders as a bare "Unset" rather than
  // "Unset (50 MB)". Waiting for both parts would hold the whole table for a number in one column.
  const projectLimit = config.status === "ready" ? config.data?.fileSizeLimit : undefined;

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matched = needle ? all.filter((b) => b.name.toLowerCase().includes(needle)) : all;
    return [...matched].sort((a, b) =>
      newest ? b.created_at.localeCompare(a.created_at) : a.name.localeCompare(b.name),
    );
  }, [all, search, newest]);

  // One error slot, cleared wherever a dialog opens or closes — the rule the JWT keys page arrived
  // at after an error outlived the attempt it belonged to.
  const ask = <T,>(setter: (value: T | null) => void) => (value: T | null) => {
    setter(value);
    setProblem(null);
  };

  /**
   * Refetching after a write, without letting the refetch decide whether the write worked.
   *
   * `invalidateQueries` rejects if the refetch does, so a network blink after a successful delete
   * would leave the confirm open saying the server could not be reached — sending someone to repeat
   * a deletion that already happened, on a path with no undo.
   */
  const refetchQuietly = () => refetch().catch(() => {});

  const run = (act: () => Promise<{ ok: true } | { ok: false; reason: string }>, done: () => void) =>
    startTransition(async () => {
      setProblem(null);
      let result;
      try {
        result = await act();
      } catch {
        return setProblem("Could not reach the server.");
      }

      if (!result.ok) return setProblem(result.reason);
      await refetchQuietly();
      done();
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <IconSearch
            size={14}
            stroke={1.5}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-subtle"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search for a bucket"
            aria-label="Search for a bucket"
            className="pl-8"
          />
        </div>

        <Button variant="outline" size="sm" onClick={() => setNewest((v) => !v)}>
          <IconSortDescending size={13} stroke={1.5} />
          {newest ? "Sorted by created at" : "Sorted by name"}
        </Button>

        <Button variant="outline" size="sm" disabled={pending} onClick={() => refetch()}>
          <IconRefresh size={13} stroke={1.5} />
          Refresh
        </Button>

        <Button size="sm" className="ms-auto" onClick={() => setCreating(true)}>
          <IconPlus size={13} stroke={1.5} />
          New bucket
        </Button>
      </div>

      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}

      {isWaiting(state) ? (
        <Skeleton className="h-28 w-full" />
      ) : state.status !== "ready" ? (
        <Empty>
          Could not list this project&apos;s buckets.
          <span className="mt-1 block text-xs">{reasonOf(state)}</span>
        </Empty>
      ) : shown.length === 0 ? (
        <Empty>
          {all.length === 0 ? (
            <>
              Create a file bucket
              <span className="mt-1 block text-xs">
                Store images, videos, documents, and any other file type.
              </span>
            </>
          ) : (
            "No bucket matches that search."
          )}
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Column>Name</Column>
                <Column>Policies</Column>
                <Column>File size limit</Column>
                <Column>Allowed MIME types</Column>
                <Column className="text-right">Actions</Column>
              </TableRow>
            </TableHeader>

            <TableBody>
              {shown.map((bucket) => (
                <TableRow key={bucket.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <IconFolder size={14} stroke={1.5} className="shrink-0 text-subtle" />
                      <Link
                        href={`/p/${projectRef}/storage/b/${encodeURIComponent(bucket.id)}`}
                        className="text-sm text-foreground hover:underline"
                      >
                        {bucket.name}
                      </Link>
                      {bucket.public ? (
                        <Badge variant="outline" className={cn(PILL, "border-warn/40 text-warn")}>
                          PUBLIC
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">{bucket.policies}</TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {describeLimit(bucket.file_size_limit, projectLimit, formatBytes)}
                  </TableCell>

                  <TableCell className="text-xs text-muted-foreground">
                    {describeMimeTypes(bucket.allowed_mime_types)}
                  </TableCell>

                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => ask(setEditing)(bucket)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => ask(setDeleting)(bucket)}
                        className="text-subtle hover:text-destructive"
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <BucketForm
        open={creating}
        onOpenChange={setCreating}
        title="Create file bucket"
        submitLabel="Create"
        onSubmit={async (name, settings) => {
          const result = await createBucket(projectRef, name, settings);
          // Creating answers `{name}` alone, not the bucket, so there is nothing to patch in.
          if (result.ok) await refetchQuietly();
          return result;
        }}
      />

      <BucketForm
        open={editing !== null}
        onOpenChange={(next) => !next && ask(setEditing)(null)}
        title={`Edit ${editing?.name ?? "bucket"}`}
        submitLabel="Save"
        name={editing?.name}
        initial={
          editing
            ? {
                isPublic: editing.public,
                fileSizeLimit: editing.file_size_limit,
                allowedMimeTypes: editing.allowed_mime_types,
              }
            : undefined
        }
        onSubmit={async (_name, settings: BucketSettings) => {
          // By id, not by display name: a bucket created elsewhere can have them differ, and then
          // the name addresses nothing.
          const result = await updateBucket(projectRef, editing?.id ?? "", settings);
          if (result.ok) await refetchQuietly();
          return result;
        }}
      />

      <DeleteBucketConfirm
        open={deleting !== null}
        onOpenChange={(next) => !next && ask(setDeleting)(null)}
        name={deleting?.name ?? ""}
        busy={pending}
        error={problem}
        onConfirm={(withContents) =>
          deleting &&
          run(() => deleteBucket(projectRef, deleting.id, withContents), () => setDeleting(null))
        }
      />
    </div>
  );
}

function Column({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TableHead className={cn("text-[11px] tracking-wider text-subtle uppercase", className)}>
      {children}
    </TableHead>
  );
}
