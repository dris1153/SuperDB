"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { IconRefresh } from "@tabler/icons-react";
import { listRunningQueries } from "@/lib/sql-editor-actions";
import type { RunningQuery } from "@/lib/running-queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty } from "@/components/ui/empty-state";

/**
 * The sessions currently connected to this project.
 *
 * There is no way to end one from here. `pg_terminate_backend` on a dashboard this size, with no
 * confirmation model built for it, is a foot-gun with no matching benefit — Supabase's own UI offers
 * it, and its absence here is a decision. The footnote says so, because a missing button otherwise
 * reads as one that failed to load.
 *
 * `query` and `usename` can come back null: what the read-only role may see of another user's
 * session is limited. Those read "not visible" rather than as an empty cell, which would say there
 * is no query. Measured 2026-09-13 the role could see both, but that depends on the project's roles,
 * so the limited case is rendered rather than assumed away.
 */
export function RunningQueries({
  projectRef,
  onOpenChange,
}: {
  projectRef: string;
  /** Mounted only while open, so closing it discards the rows rather than keeping a stale list. */
  onOpenChange: (open: boolean) => void;
}) {
  const [rows, setRows] = useState<RunningQuery[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(
    () =>
      startTransition(async () => {
        try {
          const result = await listRunningQueries(projectRef);
          if (result.ok) {
            setRows(result.rows);
            setError(null);
          } else {
            setError(result.reason);
          }
        } catch {
          // The action itself was rejected — an expired session, or the network. Without this the
          // panel sits on "Reading..." for ever and the rejection escapes with no boundary to catch
          // it. The message would be a digest in production, so it is not worth showing.
          setError("Could not reach the server.");
        }
      }),
    [projectRef],
  );

  // Fetched on mount, which is when the panel is asked for: nobody needs this until they open it,
  // and it is a round trip to the database every time.
  useEffect(() => {
    load();
  }, [load]);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Running queries</DialogTitle>
          <DialogDescription>
            Client sessions on this project, most recently started last. This view cannot end a
            session.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
          {error ? (
            <p className="px-3 py-6 text-center text-xs text-destructive">{error}</p>
          ) : rows === null ? (
            <p className="px-3 py-6 text-center text-xs text-subtle">Reading…</p>
          ) : rows.length === 0 ? (
            <div className="p-3">
              <Empty>Nothing else is connected right now.</Empty>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-card text-subtle">
                <tr>
                  <th className="px-2 py-1.5 font-normal">pid</th>
                  <th className="px-2 py-1.5 font-normal">user</th>
                  <th className="px-2 py-1.5 font-normal">state</th>
                  <th className="px-2 py-1.5 font-normal">waiting on</th>
                  <th className="px-2 py-1.5 font-normal">started (UTC)</th>
                  <th className="px-2 py-1.5 font-normal">query</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.pid} className="border-t border-border align-top">
                    <td className="px-2 py-1.5 font-mono tabular-nums">{row.pid}</td>
                    <td className="px-2 py-1.5">{row.usename ?? <Hidden />}</td>
                    <td className="px-2 py-1.5">{row.state ?? <Hidden />}</td>
                    <td className="px-2 py-1.5">{row.wait_event_type ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono whitespace-nowrap">
                      {row.query_start ? row.query_start.replace("T", " ").slice(0, 19) : "—"}
                    </td>
                    <td className="max-w-md px-2 py-1.5 font-mono break-all">
                      {row.query ?? <Hidden />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px] text-subtle">
          <span>
            Truncated to 200 characters. Terminating a session is deliberately not offered here.
          </span>
          <Button variant="ghost" size="sm" disabled={pending} onClick={load}>
            <IconRefresh size={12} stroke={1.5} />
            {pending ? "Reading…" : "Refresh"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Null means the read-only role may not see this session's detail — not that there is none. */
const Hidden = () => <span className="text-subtle/60">not visible</span>;
