"use client";

import { useState, useTransition } from "react";
import type { Identity } from "@/lib/project-parts";
import { renameProject } from "@/lib/project-actions";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart, useSetPart } from "@/components/use-project-part";

/**
 * Name, ref and region — the three facts people open Settings to copy, and the one they change.
 */
export function GeneralSettings({ projectRef }: { projectRef: string }) {
  const identity = useProjectPart<Identity>(projectRef, "identity");
  const setIdentity = useSetPart<Identity>(projectRef, "identity");
  const project = identity.status === "ready" ? identity.data : null;
  const reason = reasonOf(identity);

  return (
    <section className="space-y-3">
      <Card className="divide-y divide-border p-0">
        <Row label="Project name" hint="Displayed throughout the dashboard.">
          {project ? (
            <RenameField projectRef={projectRef} project={project} onRenamed={setIdentity} />
          ) : (
            <Value waiting={isWaiting(identity)} reason={reason} />
          )}
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

/**
 * The field keeps what was typed when a rename is refused.
 *
 * Resetting it to the stored name on failure would throw away the only copy of what the user meant,
 * and the most common refusal — a name too long — is one the user fixes by editing what they typed.
 */
function RenameField({
  projectRef,
  project,
  onRenamed,
}: {
  projectRef: string;
  project: Identity;
  onRenamed: (next: Identity) => void;
}) {
  const [name, setName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== project.name;

  const save = () =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await renameProject(projectRef, name);
        if (!result.ok) return setError(result.reason);
        // The server's answer, not what was typed: it trimmed the value, and the field should show
        // what the project is actually called.
        setName(result.name);
        onRenamed({ ...project, name: result.name });
      } catch {
        setError("Could not reach the server.");
      }
    });

  return (
    <div className="min-w-0 flex-1 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && dirty && !pending) save();
          }}
          disabled={pending}
          aria-label="Project name"
          className="max-w-xs"
        />
        <Button size="sm" onClick={save} disabled={!dirty || pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
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
  children?: React.ReactNode;
}) {
  if (waiting) return <Skeleton className="h-5 w-48" />;
  if (reason) return <span className="text-sm text-subtle">{reason}</span>;

  return (
    <span className={mono ? "truncate font-mono text-sm text-foreground" : "truncate text-sm text-foreground"}>
      {children}
    </span>
  );
}
