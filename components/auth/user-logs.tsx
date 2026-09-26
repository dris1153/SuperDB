"use client";

import { useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import type { UserEvent } from "@/lib/auth-audit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";

/**
 * What this user did, and what was done to them.
 *
 * Two sources in one read — `auth_logs` for requests, `auth_audit_logs` for events — which is what
 * the original interleaves. Read only when the tab is opened: Radix mounts one tab's content at a
 * time, and the logs endpoint throttles hard enough that nothing here should poll it.
 *
 * **Error only filters what is already here**, rather than asking again. A hundred rows are in
 * memory, the endpoint is the throttled one, and a second query would spend a request to hide rows
 * the browser is already holding.
 *
 * **Empty is the normal case.** Retention on a free project is short, so a user with nothing recent
 * is not a failure and does not read as one.
 */
export function UserLogs({ projectRef, userId }: { projectRef: string; userId: string }) {
  const params = { id: userId };
  const state = useProjectPart<UserEvent[]>(projectRef, "auth-user-logs", params);
  const refetch = useRefetchPart(projectRef, "auth-user-logs", params);

  const [errorsOnly, setErrorsOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  };

  const all = state.status === "ready" && Array.isArray(state.data) ? state.data : [];
  const events = errorsOnly ? all.filter((e) => e.failed) : all;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm text-foreground">Authentication logs</h3>
        <p className="text-xs text-muted-foreground">
          Requests and events for this user over the past day
        </p>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {[
            { value: false, label: "Show all" },
            { value: true, label: "Error only" },
          ].map(({ value, label }) => (
            <Button
              key={label}
              size="sm"
              variant={errorsOnly === value ? "secondary" : "ghost"}
              className="h-7"
              onClick={() => setErrorsOnly(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        <Button size="sm" variant="outline" className="gap-2" onClick={refresh} disabled={refreshing}>
          <IconRefresh className={refreshing ? "size-4 animate-spin" : "size-4"} />
          Refresh
        </Button>
      </div>

      {isWaiting(state) ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : events.length === 0 ? (
        <Empty>
          {errorsOnly && all.length > 0
            ? "No failures among these."
            : "No auth activity for this user in the last 24 hours."}
        </Empty>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {events.map((event, i) => (
            <li key={`${event.at}-${i}`} className="flex items-start gap-3 px-3 py-2 text-xs">
              <time className="w-32 shrink-0 font-mono text-subtle">{clock(event.at)}</time>

              <span className="w-12 shrink-0">
                {event.status === null ? null : (
                  <Badge
                    variant="outline"
                    className={event.failed ? "text-[10px] text-destructive" : "text-[10px]"}
                  >
                    {event.status}
                  </Badge>
                )}
              </span>

              <span className="min-w-0 flex-1 font-mono break-all text-muted-foreground">
                {event.path ? `${event.path} | ` : ""}
                <span className="text-foreground">{event.message}</span>
                {event.actor ? <span className="text-subtle"> by {event.actor}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Two lines' worth on one: the date, then the time, as the original prints them. */
function clock(at: string): string {
  const when = new Date(at);
  if (Number.isNaN(when.getTime())) return at;

  return when
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
    .replace(",", "");
}
