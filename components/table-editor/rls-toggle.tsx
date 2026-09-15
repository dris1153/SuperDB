"use client";

import { useState, useTransition } from "react";
import { setRls } from "@/lib/ddl-statements";
import { setRls as setRlsAction } from "@/lib/ddl-actions";
import { Button } from "@/components/ui/button";
import { DdlConfirm } from "./ddl-confirm";
import { useRefreshTable } from "./use-refresh-table";

/**
 * Turning row level security on or off.
 *
 * Off is the dangerous direction and it does not look it: the policies stay listed, they simply stop
 * being enforced, so a table that reads as protected becomes readable by every client key. The
 * confirmation says that rather than leaving it to be inferred from "disable".
 */
export function RlsToggle({
  projectRef,
  projectName,
  schema,
  table,
  rls,
  policyCount,
}: {
  projectRef: string;
  projectName: string;
  schema: string;
  table: string;
  rls: boolean;
  policyCount: number;
}) {
  const refresh = useRefreshTable(projectRef);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const next = !rls;
  const confirm = () =>
    start(async () => {
      try {
        const res = await setRlsAction(projectRef, schema, table, next);
        if (!res.ok) {
          setError(res.reason);
          return;
        }
        setConfirming(false);
        refresh();
      } catch {
        setError("The request failed before it answered. Reload and check whether RLS is on.");
      }
    });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => { setError(null); setConfirming(true); }}
      >
        {next ? "Enable RLS" : "Disable RLS"}
      </Button>

      <DdlConfirm
        open={confirming}
        onOpenChange={setConfirming}
        action={next ? "Enable RLS" : "Disable RLS"}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={table}
        sql={setRls(schema, table, next)}
        warning={
          next ? null : (
            <p>
              {policyCount === 0
                ? "Every row becomes readable by anyone holding the project's anon key."
                : `The ${policyCount} polic${policyCount === 1 ? "y" : "ies"} on this table stay in place but stop being enforced — every row becomes readable by anyone holding the project's anon key.`}
            </p>
          )
        }
        busy={busy}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
