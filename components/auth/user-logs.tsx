"use client";

import { describeAction, type AuditEvent } from "@/lib/auth-audit";
import { date } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";

/**
 * What happened to this user, and what they did.
 *
 * Read only when the tab is opened — Radix mounts one tab's content at a time, and the logs
 * endpoint throttles hard enough that nothing here should poll it.
 *
 * **Empty is the normal case.** The measured project held nine audit rows against four thousand
 * pgbouncer ones, and retention on a free project is short, so a user with nothing recent is not a
 * failure and does not read as one.
 */
export function UserLogs({ projectRef, userId }: { projectRef: string; userId: string }) {
  const state = useProjectPart<AuditEvent[]>(projectRef, "auth-user-logs", { id: userId });

  if (isWaiting(state)) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (state.status !== "ready") return <Empty>{reasonOf(state)}</Empty>;

  const events = Array.isArray(state.data) ? state.data : [];
  if (events.length === 0) {
    return <Empty>No auth events for this user in the last 24 hours.</Empty>;
  }

  return (
    <ul className="space-y-2">
      {events.map((event, i) => (
        <li
          key={`${event.at}-${i}`}
          className="rounded-md border border-border p-3 text-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              {describeAction(event.action)}
              {/* The distinction the two filters exist for: something this user did, against
                  something an administrator did to them. */}
              {event.byThisUser ? null : (
                <Badge variant="outline" className="text-[10px]">
                  by {event.actorUsername ?? "someone else"}
                </Badge>
              )}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{date(event.at)}</span>
          </div>
          {event.ip ? <div className="pt-1 font-mono text-xs text-subtle">{event.ip}</div> : null}
        </li>
      ))}
    </ul>
  );
}
