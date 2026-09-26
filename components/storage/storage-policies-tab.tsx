"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { IconFolder, IconPlus, IconTrash } from "@tabler/icons-react";
import type { BucketRow } from "@/lib/buckets";
import { groupPolicies, type StorageTable } from "@/lib/storage-policies";
import { dropStoragePolicy } from "@/lib/storage-policy-actions";
import type { Policy } from "@/lib/table-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { DropPolicyConfirm } from "./policy-dialog";
import { NewPolicyDialog } from "./policy-dialog";

type PolicyPart = { objects: Policy[]; buckets: Policy[] };

/**
 * The policies governing storage, in the two groups the Supabase dashboard uses.
 *
 * **A policy is matched to a bucket by reading its SQL**, because the database models no relation
 * between the two — see `lib/storage-policies.ts`. The heuristic can miss, which is exactly why
 * unmatched policies get a section of their own: being wrong has to mean "listed somewhere else",
 * never "not listed".
 */
export function StoragePoliciesTab({ projectRef }: { projectRef: string }) {
  const state = useProjectPart<PolicyPart>(projectRef, "storage-policies");
  const buckets = useProjectPart<BucketRow[]>(projectRef, "buckets");
  const refetch = useRefetchPart(projectRef, "storage-policies");
  const refetchBuckets = useRefetchPart(projectRef, "buckets");

  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [dropping, setDropping] = useState<{ table: StorageTable; policy: Policy } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const data = state.status === "ready" ? state.data : undefined;
  // The query's own array rather than a fresh one per render, so the grouping below memoises on
  // something stable — `useProjectPart` returns a new object every render.
  const bucketData = buckets.status === "ready" ? buckets.data : undefined;
  const names = useMemo(
    () => (Array.isArray(bucketData) ? bucketData.map((b) => b.id) : []),
    [bucketData],
  );

  const groups = useMemo(
    () => groupPolicies(data?.objects ?? [], data?.buckets ?? [], names),
    [data, names],
  );

  const drop = (table: StorageTable, name: string) =>
    startTransition(async () => {
      setProblem(null);
      try {
        const result = await dropStoragePolicy(projectRef, table, name);
        if (!result.ok) return setProblem(result.reason);
        setDropping(null);
        // Both: a policy count rides on every row of the Buckets tab.
        await Promise.all([refetch().catch(() => {}), refetchBuckets().catch(() => {})]);
      } catch {
        setProblem("Could not reach the server.");
      }
    });

  // Both parts, not just the policies. Without the bucket list this tab cannot tell a policy that
  // names no bucket from one whose bucket it simply has not heard of yet — and it would say
  // "Create a bucket first" to a project full of them.
  if (isWaiting(state) || isWaiting(buckets)) return <Skeleton className="h-40 w-full" />;

  if (state.status !== "ready") {
    return (
      <Empty>
        Could not read this project&apos;s storage policies.
        <span className="mt-1 block text-xs">{reasonOf(state)}</span>
      </Empty>
    );
  }

  if (buckets.status !== "ready") {
    return (
      <Empty>
        Could not read this project&apos;s buckets, so these policies cannot be grouped by bucket.
        <span className="mt-1 block text-xs">{reasonOf(buckets)}</span>
      </Empty>
    );
  }

  return (
    <div className="space-y-8">
      {problem ? <p className="text-xs text-destructive">{problem}</p> : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg text-foreground">Buckets</h2>
          <p className="text-sm text-subtle">
            Write policies for each bucket to control access to the bucket and its contents
          </p>
        </div>

        {names.length === 0 ? (
          <Empty>Create a bucket first to start writing policies</Empty>
        ) : (
          groups.byBucket.map(({ bucket, policies }) => (
            <PolicyCard
              key={bucket}
              title={bucket}
              icon
              policies={policies}
              busy={pending}
              onNew={() => {
                setProblem(null);
                setCreatingFor(bucket);
              }}
              onDrop={(policy) => setDropping({ table: "objects", policy })}
            />
          ))
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg text-foreground">Schema</h2>
          <p className="text-sm text-subtle">
            Write policies for the tables under the storage schema directly for greater control
          </p>
        </div>

        <PolicyCard
          title="Other policies under storage.objects"
          policies={groups.otherObjects}
          busy={pending}
          note="These name no bucket this project has, so they apply more widely than one bucket."
          onDrop={(policy) => setDropping({ table: "objects", policy })}
        />

        <PolicyCard
          title="Policies under storage.buckets"
          policies={groups.onBuckets}
          busy={pending}
          note="About listing buckets themselves rather than their contents."
          onDrop={(policy) => setDropping({ table: "buckets", policy })}
        />

        <p className="text-xs text-subtle">
          Anything these four shapes do not cover is ordinary SQL — write it in the{" "}
          <Link href={`/p/${projectRef}/sql`} className="text-foreground underline underline-offset-2">
            SQL editor
          </Link>
          .
        </p>
      </section>

      <NewPolicyDialog
        open={creatingFor !== null}
        onOpenChange={(next) => !next && setCreatingFor(null)}
        projectRef={projectRef}
        bucket={creatingFor ?? ""}
        onCreated={() => {
          void refetch().catch(() => {});
          void refetchBuckets().catch(() => {});
        }}
      />

      <DropPolicyConfirm
        open={dropping !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDropping(null);
            setProblem(null);
          }
        }}
        policy={dropping?.policy ?? null}
        table={dropping?.table ?? "objects"}
        busy={pending}
        error={problem}
        onConfirm={() => dropping && drop(dropping.table, dropping.policy.name)}
      />
    </div>
  );
}

function PolicyCard({
  title,
  icon,
  policies,
  busy,
  note,
  onNew,
  onDrop,
}: {
  title: string;
  icon?: boolean;
  policies: Policy[];
  busy: boolean;
  note?: string;
  onNew?: () => void;
  onDrop: (policy: Policy) => void;
}) {
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {icon ? <IconFolder size={14} stroke={1.5} className="shrink-0 text-subtle" /> : null}
        <span className="min-w-0 flex-1 font-mono text-xs tracking-wide text-foreground uppercase">
          {title}
        </span>
        {onNew ? (
          <Button variant="outline" size="sm" disabled={busy} onClick={onNew}>
            <IconPlus size={13} stroke={1.5} />
            New policy
          </Button>
        ) : null}
      </div>

      {note ? <p className="px-4 pt-3 text-xs text-subtle">{note}</p> : null}

      {policies.length === 0 ? (
        <p className="px-4 py-4 text-sm text-subtle">No policies created yet</p>
      ) : (
        <ul className="divide-y divide-border">
          {policies.map((policy) => (
            <li key={policy.name} className="flex flex-wrap items-center gap-2 px-4 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{policy.name}</span>
              <Badge variant="outline">{policy.command}</Badge>
              {/* Worth its own badge: dropping a restrictive policy widens access rather than
                  narrowing it, which is the opposite of what a trash icon suggests. */}
              {!policy.permissive ? (
                <Badge variant="outline" className="border-warn/40 text-warn">
                  RESTRICTIVE
                </Badge>
              ) : null}
              {policy.roles ? <span className="text-xs text-subtle">{policy.roles}</span> : null}
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                aria-label={`Drop ${policy.name}`}
                onClick={() => onDrop(policy)}
                className="text-subtle hover:text-destructive"
              >
                <IconTrash size={13} stroke={1.5} />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
