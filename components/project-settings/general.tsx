"use client";

import type { Identity } from "@/lib/project-parts";
import { CopyButton } from "@/components/copy-button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";

/**
 * Name, ref and region — the three facts people open Settings to copy.
 *
 * Read-only for now. Renaming is one API call and four places that hold the old name, so it has a
 * phase of its own rather than a Save button that works most of the time.
 */
export function GeneralSettings({ projectRef }: { projectRef: string }) {
  const identity = useProjectPart<Identity>(projectRef, "identity");
  const project = identity.status === "ready" ? identity.data : null;
  const reason = reasonOf(identity);

  return (
    <section className="space-y-3">
      <h2 className="text-sm text-muted-foreground">General settings</h2>

      <Card className="divide-y divide-border p-0">
        <Row label="Project name" hint="Displayed throughout the dashboard.">
          <Value waiting={isWaiting(identity)} reason={reason}>
            {project?.name}
          </Value>
        </Row>

        <Row label="Project ID" hint="Reference used in APIs and URLs.">
          <Value waiting={isWaiting(identity)} reason={reason} mono>
            {project?.ref}
          </Value>
          {project ? <CopyButton value={project.ref} /> : null}
        </Row>

        <Row label="Project region" hint="Where this project runs.">
          <Value waiting={isWaiting(identity)} reason={reason} mono>
            {project?.region}
          </Value>
          {project ? <CopyButton value={project.region} /> : null}
        </Row>
      </Card>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap">
      <div className="min-w-0 sm:w-64">
        <div className="text-sm text-foreground">{label}</div>
        <p className="mt-0.5 text-xs text-subtle">{hint}</p>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  );
}

/** A wait, a refusal and an answer are three different things, and the em dash is only the third. */
function Value({
  waiting,
  reason,
  mono,
  children,
}: {
  waiting: boolean;
  reason: string | null;
  mono?: boolean;
  children: React.ReactNode;
}) {
  if (waiting) return <Skeleton className="h-5 w-48" />;
  if (reason) return <span className="text-sm text-subtle">{reason}</span>;

  return (
    <span className={mono ? "truncate font-mono text-sm text-foreground" : "truncate text-sm text-foreground"}>
      {children}
    </span>
  );
}
