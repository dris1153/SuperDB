"use client";

import { IconShieldLock } from "@tabler/icons-react";
import type { Policy } from "@/lib/table-editor";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { RlsToggle } from "./rls-toggle";

export function RlsPanel({
  projectRef,
  projectName,
  schema,
  table,
  rls,
  policies,
  editable,
}: {
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
  rls: boolean;
  policies: Policy[];
  /** A view has no RLS of its own to toggle. */
  editable: boolean;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
          <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">
            {policies.length}
          </span>
          RLS {rls ? "policies" : "off"}
        </button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <IconShieldLock size={16} stroke={1.5} />
            Row level security
          </SheetTitle>
          <SheetDescription>
            {rls
              ? `Enabled on ${table}.`
              : `Not enabled on ${table} — these policies exist but nothing enforces them.`}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          {editable ? (
            <RlsToggle
              projectRef={projectRef}
              projectName={projectName}
              schema={schema}
              table={table}
              rls={rls}
              policyCount={policies.length}
            />
          ) : null}

          {/* Without this the count above implies a filtering that is not happening. */}
          <p className="rounded-md border border-warn/40 px-3 py-2 text-xs text-warn">
            The rows shown in this editor are <strong>not</strong> filtered by these policies. Queries
            run as a role that bypasses RLS, so you are seeing every row regardless of what the
            policies allow.
          </p>

          {policies.length === 0 ? (
            <p className="text-sm text-subtle">No policies defined on this table.</p>
          ) : (
            policies.map((p) => (
              <div key={p.name} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">{p.name}</span>
                  <Badge variant="outline" className="rounded-full text-[10px]">
                    {p.command}
                  </Badge>
                  {p.roles ? (
                    <span className="font-mono text-[11px] text-subtle">{p.roles}</span>
                  ) : null}
                </div>
                {p.using_expr ? (
                  <div>
                    <div className="text-[11px] text-subtle">USING</div>
                    <pre className="overflow-x-auto rounded bg-card p-2 font-mono text-xs">
                      {p.using_expr}
                    </pre>
                  </div>
                ) : null}
                {p.check_expr ? (
                  <div>
                    <div className="text-[11px] text-subtle">WITH CHECK</div>
                    <pre className="overflow-x-auto rounded bg-card p-2 font-mono text-xs">
                      {p.check_expr}
                    </pre>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
