"use client";

import Link from "next/link";
import type { StorageConfig } from "@/lib/mgmt-api";
import { featureEnabled, type FeatureName } from "@/lib/storage-config";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { PILL } from "@/components/status";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";
import { cn } from "@/lib/utils";

/**
 * Analytics and Vectors: two bucket kinds this project either has or does not.
 *
 * **The gate is the project's own flag, not a guess about its plan.** `/config/storage` reports
 * `icebergCatalog.enabled` and `vectorBuckets.enabled`, so a project that does have them is told so
 * rather than being shown an upgrade prompt — which is more than the original manages.
 *
 * Neither is buildable past that: the Management API has no path for creating either kind. Whether
 * they are Pro-only is **unmeasured** — one project was looked at and both flags were off on it —
 * so this page says what the flag says and nothing about why. What it shows is what is true:
 * whether the project may use them, and where to go if it may.
 */
export function BucketKind({
  projectRef,
  title,
  blurb,
  intro,
  feature,
}: {
  projectRef: string;
  title: string;
  blurb: string;
  intro: string;
  /**
   * The flag in `features` that decides this, named once.
   *
   * It used to be two props — the name, and a predicate reading it — with nothing tying them
   * together, so gating Analytics on the Vectors flag while printing the word `icebergCatalog`
   * typechecked.
   */
  feature: FeatureName;
}) {
  const state = useProjectPart<StorageConfig>(projectRef, "storage-config");

  if (isWaiting(state)) return <Skeleton className="h-40 w-full" />;

  if (state.status !== "ready") {
    return (
      <Empty>
        Could not read whether this project has {title.toLowerCase()} buckets.
        <span className="mt-1 block text-xs">{reasonOf(state)}</span>
      </Empty>
    );
  }

  const config = state.data;

  // An upstream success with no body reaches here as `null` — the route handler ships `data ?? null`
  // on purpose. Claiming the feature is off would be a specific statement about a config this app
  // never received.
  if (!config) {
    return (
      <Empty>
        This project&apos;s storage config came back empty, so whether it has{" "}
        {title.toLowerCase()} buckets is unknown.
      </Empty>
    );
  }

  const on = featureEnabled(config, feature);

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={cn(PILL, "border-brand-border text-primary")}>
            NEW
          </Badge>
          <span className="text-sm text-foreground">Introducing {title.toLowerCase()} buckets</span>
        </div>
        <p className="text-xs text-subtle">{intro}</p>
      </Card>

      <Card className="space-y-2 p-8 text-center">
        <p className="text-sm text-foreground">{blurb}</p>
        {on ? (
          <p className="text-xs text-subtle">
            This project can use them. Creating one is not available here — the Management API has no
            endpoint for it — so it happens in the{" "}
            <Link
              href={`https://supabase.com/dashboard/project/${projectRef}`}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              Supabase dashboard
            </Link>
            .
          </p>
        ) : (
          <p className="text-xs text-subtle">
            Not available on this project: <span className="font-mono">{feature}</span> is off in
            its storage config.
          </p>
        )}
      </Card>
    </div>
  );
}
