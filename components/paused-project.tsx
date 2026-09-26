"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconExternalLink,
  IconPlayerPause,
  IconLoader2,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { resumeProject } from "@/lib/project-actions";
import type { Project } from "@/lib/mgmt-api";
import { isMoving, isPaused } from "@/lib/project-status";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

const dash = (path: string) => `https://supabase.com/dashboard/${path}`;

function OutLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-brand-text hover:underline"
    >
      {children}
      <IconExternalLink size={12} stroke={1.5} />
    </a>
  );
}

export function PausedProject({ project }: { project: Project }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  /**
   * Set the moment a resume is accepted, and deliberately not derived from the status.
   *
   * Supabase reports the new state only after a lag, so the refresh that follows a successful resume
   * still says INACTIVE. Reading the status alone would drop straight back to the idle card — and
   * the obvious next move, clicking Resume again, is rejected because the project is already on its
   * way up.
   */
  const [resumed, setResumed] = useState(false);

  const moving = isMoving(project.status);
  // The local flag only counts while the server still reports the project as paused. Once it does
  // not, the status speaks for itself — which is derived state, not something an effect should reset.
  const waiting = moving || (resumed && isPaused(project.status));

  /**
   * Restoring takes minutes, so the page checks back rather than leaving a stale screen. Ten seconds
   * rather than one: the Management API throttles per token, and nothing here changes faster.
   */
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [waiting, router]);

  function resume() {
    start(async () => {
      const result = await resumeProject(project.ref);
      if (result.ok) {
        setResumed(true);
        router.refresh();
      } else {
        toast.error(`Failed to restore project: ${result.reason}`);
      }
    });
  }

  const busy = pending || waiting;

  return (
    <Card className="mx-auto max-w-2xl gap-0 overflow-hidden p-0">
      <div className="space-y-5 p-6">
        <span className="flex size-11 items-center justify-center rounded-full border border-border text-muted-foreground">
          {busy ? (
            <IconLoader2 size={20} stroke={1.5} className="animate-spin" />
          ) : (
            <IconPlayerPause size={20} stroke={1.5} />
          )}
        </span>

        <h2 className="text-xl text-foreground">
          {/* While the status still lags behind an accepted resume it reads INACTIVE, which would
              put "is inactive" above a spinner. Say what is happening, not what was last reported. */}
          {waiting
            ? `Project "${project.name}" is ${moving ? project.status.toLowerCase().replace(/_/g, " ") : "restoring"}`
            : `Project "${project.name}" is paused`}
        </h2>

        {waiting ? (
          <p className="text-sm text-muted-foreground">
            This takes a few minutes. The page checks again every ten seconds.
          </p>
        ) : (
          <ul className="space-y-2 text-sm text-muted-foreground">
            {project.status === "RESTORE_FAILED" ? (
              <li className="flex gap-2">
                <span className="text-destructive">•</span>
                <span className="text-destructive">
                  The last attempt to restore this project failed. Trying again
                  is safe.
                </span>
              </li>
            ) : null}
            <li className="flex gap-2">
              <span>•</span>
              <span>
                All data, including backups and storage objects, remains safe.
              </span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              {/* Supabase does not publish the restore deadline through its API, so this links to
                  the one place that knows rather than guessing a date about permanent data loss. */}
              <span>
                This project stays resumable for a limited time. The deadline is
                shown on its{" "}
                <OutLink href={dash(`project/${project.ref}`)}>
                  Supabase dashboard
                </OutLink>
                .
              </span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>
                After that it can no longer be resumed, but the data stays
                downloadable.
              </span>
            </li>
            <li className="flex gap-2">
              <span>•</span>
              <span>To prevent future pauses, consider upgrading to Pro.</span>
            </li>
          </ul>
        )}
      </div>

      {waiting ? null : (
        <>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
            <Button variant="outline" asChild>
              <a
                href={dash(`org/${project.organization_slug}/billing`)}
                target="_blank"
                rel="noreferrer"
              >
                Upgrade to Pro
                <IconExternalLink size={13} stroke={1.5} />
              </a>
            </Button>
            <Button onClick={resume} disabled={pending}>
              {pending ? "Resuming…" : "Resume project"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
            <div>
              <div className="text-sm text-foreground">Export your data</div>
              <p className="text-xs text-subtle">
                Download backups for your database and storage objects
              </p>
            </div>
            <Button variant="outline" asChild>
              <a
                href={dash(`project/${project.ref}/database/backups`)}
                target="_blank"
                rel="noreferrer"
              >
                Download backups
                <IconExternalLink size={13} stroke={1.5} />
              </a>
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
