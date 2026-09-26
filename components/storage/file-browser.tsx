"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  IconChevronRight,
  IconFile,
  IconFolder,
  IconPhoto,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import type { BucketRow } from "@/lib/buckets";
import {
  breadcrumbs,
  isFolder,
  isPreviewable,
  joinPath,
  PAGE_SIZE,
  sortEntries,
  type StorageObject,
} from "@/lib/storage-objects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PILL } from "@/components/status";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { FileDetails } from "./file-details";
import { UploadButton } from "./upload-button";
import { cn } from "@/lib/utils";

/**
 * Inside a bucket.
 *
 * **There are no folders.** A `notes` entry exists because an object is named
 * `notes/deep/second.txt`, and the only thing distinguishing it from a file is `id === null` — see
 * `lib/storage-objects.ts`, which has the measurement. So "open a folder" is "list with a longer
 * prefix", and a folder with nothing in it cannot exist at all.
 */
export function FileBrowser({ projectRef, bucket }: { projectRef: string; bucket: string }) {
  const [prefix, setPrefix] = useState("");
  const [search, setSearch] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // Deferred, so a search term does not send one request per keystroke. The listing is filtered
  // upstream rather than in the browser — a folder can hold more objects than one page returns, so
  // filtering what arrived would search only part of it.
  const query = useDeferredValue(search.trim());

  const params = useMemo(
    () => ({ bucket, prefix, ...(query ? { q: query } : {}) }),
    [bucket, prefix, query],
  );

  // `keepPrevious`: the list stays on screen while a new term is in flight, rather than flashing to
  // a skeleton on every character.
  const state = useProjectPart<StorageObject[]>(projectRef, "objects", params, { keepPrevious: true });
  const refetch = useRefetchPart(projectRef, "objects", params);
  const buckets = useProjectPart<BucketRow[]>(projectRef, "buckets");

  const [pending, startTransition] = useTransition();

  const known = buckets.status === "ready" && Array.isArray(buckets.data) ? buckets.data : null;
  const here = known?.find((b) => b.id === bucket) ?? null;
  // Only once the list has actually arrived: `here` is null while it is loading too.
  const missing = known !== null && here === null;

  const data = state.status === "ready" ? state.data : undefined;
  const entries = useMemo(() => (Array.isArray(data) ? sortEntries(data) : []), [data]);

  // Derived from the listing rather than captured at click time. A snapshot would keep showing the
  // old size and type after a file was overwritten, and would keep the panel open on an object that
  // has since been deleted somewhere else.
  const selected = entries.find((e) => e.name === selectedName) ?? null;

  const open = (entry: StorageObject) => {
    if (isFolder(entry)) {
      setPrefix(joinPath(prefix, entry.name));
      setSelectedName(null);
    } else {
      setSelectedName(entry.name);
    }
  };

  const trail = breadcrumbs(prefix);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href={`/p/${projectRef}/storage`} className="text-muted-foreground hover:text-foreground">
          Files
        </Link>
        <IconChevronRight size={13} stroke={1.5} className="text-subtle" />
        <button
          type="button"
          onClick={() => {
            setPrefix("");
            setSelectedName(null);
          }}
          className="text-foreground"
        >
          {bucket}
        </button>
        {here?.public ? (
          <Badge variant="outline" className={cn(PILL, "border-warn/40 text-warn")}>
            PUBLIC
          </Badge>
        ) : null}

        {trail.map((step) => (
          <span key={step.prefix} className="flex items-center gap-2">
            <IconChevronRight size={13} stroke={1.5} className="text-subtle" />
            <button
              type="button"
              onClick={() => {
                setPrefix(step.prefix);
                setSelectedName(null);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {step.name}
            </button>
          </span>
        ))}
      </div>

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
            placeholder={prefix ? `Search in ${prefix}` : "Search in root directory"}
            aria-label="Search this folder"
            className="pl-8"
          />
        </div>

        <Button variant="outline" size="sm" disabled={pending} onClick={() => refetch().catch(() => {})}>
          <IconRefresh size={13} stroke={1.5} />
          Refresh
        </Button>

        <UploadButton
          key={`${bucket}/${prefix}`}
          projectRef={projectRef}
          bucket={bucket}
          prefix={prefix}
          onUploaded={() => startTransition(() => void refetch().catch(() => {}))}
        />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        <Card className="min-w-0 flex-1 p-0">
          {isWaiting(state) ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : state.status !== "ready" ? (
            <div className="p-4">
              <Empty>
                Could not list this folder.
                <span className="mt-1 block text-xs">{reasonOf(state)}</span>
              </Empty>
            </div>
          ) : missing ? (
            <div className="p-4">
              <Empty>
                This project has no bucket called <span className="font-mono">{bucket}</span>.
                <span className="mt-1 block text-xs">
                  An unknown bucket lists as empty rather than as missing, so this is checked
                  against the project&apos;s own list.
                </span>
              </Empty>
            </div>
          ) : entries.length === 0 ? (
            <div className="p-4">
              <Empty>
                {search.trim() ? "Nothing here matches that search." : "This folder is empty."}
                {!search.trim() ? (
                  <span className="mt-1 block text-xs">
                    Upload a file to it — a folder in Storage exists only while something is inside it.
                  </span>
                ) : null}
              </Empty>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((entry) => (
                <li key={entry.name}>
                  <button
                    type="button"
                    onClick={() => open(entry)}
                    className={cn(
                      "flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-muted/60",
                      selectedName === entry.name ? "bg-muted" : null,
                    )}
                  >
                    <Icon entry={entry} />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{entry.name}</span>
                    {isFolder(entry) ? (
                      <IconChevronRight size={13} stroke={1.5} className="shrink-0 text-subtle" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {entries.length >= PAGE_SIZE ? (
            <p className="border-t border-border px-4 py-2 text-xs text-warn">
              Showing the first {PAGE_SIZE} entries in this folder. There are more.
            </p>
          ) : null}
        </Card>

        {selected ? (
          <FileDetails
            // Remounts when another file is chosen, so its signed URL and its delete confirm belong
            // to the file on screen rather than being cleared one at a time.
            key={joinPath(prefix, selected.name)}
            projectRef={projectRef}
            bucket={bucket}
            prefix={prefix}
            entry={selected}
            onClose={() => setSelectedName(null)}
            onDeleted={() => {
              setSelectedName(null);
              void refetch().catch(() => {});
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

function Icon({ entry }: { entry: StorageObject }) {
  const Glyph = isFolder(entry) ? IconFolder : isPreviewable(entry) ? IconPhoto : IconFile;
  return <Glyph size={14} stroke={1.5} className="shrink-0 text-subtle" />;
}
