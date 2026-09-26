"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { StorageConfig } from "@/lib/mgmt-api";
import { saveStorageConfig } from "@/lib/storage-actions";
import { s3Endpoint, s3ProtocolOn } from "@/lib/storage-config";
import { CopyButton } from "@/components/copy-button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";

/**
 * The S3-compatible face of this project's storage.
 *
 * Two thirds of this screen are available and one third is not. The protocol switch is
 * `features.s3Protocol` in the storage config; the endpoint is the project ref on a fixed host and
 * the region comes from the project record.
 *
 * **Access keys cannot be managed here.** The Supabase dashboard lists them and offers to create
 * one; no path in the Management API's OpenAPI spec backs either, and they are not the project API
 * keys this app can already read. Rather than a disabled button implying the feature is one
 * permission away, the section says what is missing and where it lives — the same choice the legacy
 * JWT secret tab makes.
 */
export function S3Config({ projectRef, region }: { projectRef: string; region: string }) {
  const state = useProjectPart<StorageConfig>(projectRef, "storage-config");
  const refetch = useRefetchPart(projectRef, "storage-config");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (isWaiting(state)) return <Skeleton className="h-48 w-full" />;

  if (state.status !== "ready") {
    return (
      <Empty>
        Could not read this project&apos;s storage config.
        <span className="mt-1 block text-xs">{reasonOf(state)}</span>
      </Empty>
    );
  }

  const on = s3ProtocolOn(state.data);
  const endpoint = s3Endpoint(projectRef);

  const toggle = (next: boolean) =>
    startTransition(async () => {
      setProblem(null);
      try {
        const result = await saveStorageConfig(projectRef, { s3Protocol: next });
        if (!result.ok) return setProblem(result.reason);
        await refetch().catch(() => {});
      } catch {
        setProblem("Could not reach the server.");
      }
    });

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg text-foreground">Connection</h2>
          <p className="text-sm text-subtle">
            Connect to your bucket using any S3-compatible service via the S3 protocol
          </p>
        </div>

        <Card className="divide-y divide-border p-0">
          <div className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground">S3 protocol connection</div>
              <p className="mt-0.5 text-xs text-subtle">
                Allow clients to connect to Supabase Storage via the S3 protocol
              </p>
            </div>
            <Switch checked={on} onCheckedChange={toggle} disabled={pending} />
          </div>

          <Field label="Endpoint" value={endpoint} />
          <Field label="Region" value={region} />
        </Card>

        {problem ? <p className="text-xs text-destructive">{problem}</p> : null}

        {!on ? (
          <p className="text-xs text-subtle">
            The protocol is off. What the endpoint answers in that state was not measured.
          </p>
        ) : null}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg text-foreground">Access keys</h2>
          <p className="text-sm text-subtle">Separate from this project&apos;s API keys</p>
        </div>

        <Card className="space-y-2 p-4">
          <p className="text-sm text-foreground">S3 access keys cannot be managed here.</p>
          <p className="text-xs text-subtle">
            Nothing in the Supabase Management API lists or creates them, and they are not the
            project API keys this app can read — they are a separate credential the dashboard issues.
            Create one in{" "}
            <Link
              href={`https://supabase.com/dashboard/project/${projectRef}`}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              this project on the Supabase dashboard
            </Link>
            , under Storage, then use it against the endpoint above.
          </p>
        </Card>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4">
      <div className="text-sm text-foreground sm:w-32">{label}</div>
      <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
        {value}
      </code>
      <CopyButton value={value} />
    </div>
  );
}
