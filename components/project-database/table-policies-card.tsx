"use client";

import { useState, useTransition } from "react";
import { IconDotsVertical, IconEdit, IconLock, IconTable, IconTrash } from "@tabler/icons-react";
import { dropPolicySql, type DbPolicy } from "@/lib/policy-statements";
import { dataApiStatus, hasApiAccess, type PolicyTable } from "@/lib/policy-model";
import { dropPolicy } from "@/lib/policy-actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DdlConfirm } from "@/components/table-editor/ddl-confirm";
import { RlsToggle } from "@/components/table-editor/rls-toggle";
import { useRefreshTable } from "@/components/table-editor/use-refresh-table";

const Head = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <TableHead className={`font-mono text-[11px] font-normal tracking-widest whitespace-nowrap text-muted-foreground uppercase ${className ?? ""}`}>
    {children}
  </TableHead>
);
const Pill = ({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "warn" }) => (
  <span className={`inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px] tracking-wide uppercase ${tone === "warn" ? "border-amber-500/40 bg-amber-500/10 text-amber-500" : "border-border text-muted-foreground"}`}>
    {children}
  </span>
);
const Chip = ({ children }: { children: React.ReactNode }) => (
  <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</code>
);

/** The original's admonitions, word for word (`PolicyTableRow.utils.tsx`). */
function Admonition({ status, projectRef }: { status: ReturnType<typeof dataApiStatus>; projectRef: string }) {
  const text = {
    "custom-grants": "This table has custom Data API permissions — access may be restricted for some roles or operations.",
    "publicly-readable": "This table can be accessed by anyone via the Data API as RLS is disabled.",
    "locked-by-rls": "No data will be returned via the Data API as no RLS policies exist on this table.",
  } as Record<string, string>;
  if (status === "no-grants") {
    return (
      <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
        This table cannot be accessed via the Data API. Enable access in your project&apos;s{" "}
        <a href={`https://supabase.com/dashboard/project/${projectRef}/integrations/data_api/settings`} target="_blank" rel="noreferrer" className="text-foreground underline">
          Data API settings
        </a>
        .
      </p>
    );
  }
  return text[status] ? <p className="border-b border-border px-4 py-3 text-sm text-muted-foreground">{text[status]}</p> : null;
}

/** One table, its RLS switch, its policies — a card as the original draws it. */
export function TablePoliciesCard({ projectRef, projectName, schema, table, exposed, locked, onCreate, onEdit }: {
  projectRef: string;
  projectName: string;
  schema: string;
  table: PolicyTable;
  exposed: boolean | null;
  locked: boolean;
  onCreate: () => void;
  onEdit: (policy: DbPolicy) => void;
}) {
  const refresh = useRefreshTable(projectRef);
  const [dropping, setDropping] = useState<DbPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const status = dataApiStatus(table, exposed);

  const confirmDrop = () =>
    start(async () => {
      if (!dropping) return;
      try {
        const res = await dropPolicy(projectRef, schema, table.name, dropping.name);
        if (!res.ok) return setError(res.reason);
        setDropping(null);
        refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the policies.");
      }
    });

  return (
    <section className="overflow-hidden rounded-lg border border-border">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <IconTable size={16} stroke={1.5} className="text-muted-foreground" />
          <span className="font-mono text-sm text-foreground">{table.name}</span>
          {!table.rls ? <Pill tone="warn">RLS Disabled</Pill> : null}
          {/* As the original: silent while exposure is unknown; disabled unless the Data API can reach it. */}
          {exposed !== null && !hasApiAccess(status) ? <Pill>API Disabled</Pill> : null}
          {locked ? <Pill><IconLock size={10} /> Locked</Pill> : null}
        </div>
        {locked ? null : (
          <div className="flex items-center gap-2">
            <RlsToggle projectRef={projectRef} projectName={projectName} schema={schema} table={table.name} rls={table.rls} policyCount={table.policies.length} />
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCreate}>Create policy</Button>
          </div>
        )}
      </header>

      <Admonition status={status} projectRef={projectRef} />

      {/* Fixed columns, so every card's Command and Applied to line up down the page. */}
      <Table className="table-fixed">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <Head className="w-[45%] pl-4">Name</Head>
            <Head className="w-[20%]">Command</Head>
            <Head>Applied to</Head>
            <Head className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.policies.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="px-4 py-4 text-sm text-muted-foreground">No policies created yet</TableCell>
            </TableRow>
          ) : (
            table.policies.map((p) => (
              <TableRow key={p.name}>
                <TableCell className="max-w-96 truncate pl-4 text-foreground" title={p.name}>
                  {p.name}
                  {p.permissive ? null : <span className="ml-2 text-xs text-muted-foreground">restrictive</span>}
                </TableCell>
                <TableCell><Chip>{p.command}</Chip></TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">{(p.roles.length ? p.roles : ["public"]).map((r) => <Chip key={r}>{r}</Chip>)}</div>
                </TableCell>
                <TableCell className="pr-4">
                  {locked ? null : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="px-1.5" aria-label={`${p.name} actions`}><IconDotsVertical size={14} /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => onEdit(p)}><IconEdit size={14} /> Edit policy</DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => { setError(null); setDropping(p); }}><IconTrash size={14} /> Delete policy</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <DdlConfirm
        open={dropping !== null}
        onOpenChange={(next) => !next && setDropping(null)}
        action={`Delete policy ${dropping?.name ?? ""}`}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={table.name}
        sql={dropping ? dropPolicySql(schema, table.name, dropping.name) : null}
        warning={
          dropping && !dropping.permissive ? (
            <p>This policy is restrictive: it narrows what the others allow, so dropping it <strong className="text-foreground">widens</strong> access.</p>
          ) : (
            <p>Whatever this policy allows stops being allowed the moment it is dropped.</p>
          )
        }
        busy={busy}
        error={error}
        onConfirm={confirmDrop}
      />
    </section>
  );
}
