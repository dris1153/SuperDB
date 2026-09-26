"use client";

import { useState, useTransition } from "react";
import { IconArrowUpRight, IconCopy, IconDotsVertical, IconEdit, IconFileText, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import { dropFunctionSql, type DbFunction } from "@/lib/function-statements";
import { dropFunction } from "@/lib/function-actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";
import { CheckboxFilter } from "@/components/auth/checkbox-filter";
import { DdlConfirm } from "@/components/table-editor/ddl-confirm";
import { useRefreshTable } from "@/components/table-editor/use-refresh-table";
import { FunctionPanel, type FunctionTarget } from "./function-panel";
import { SchemaSelect, useSchemaParam } from "./schema-select";

const Head = ({ children, className }: { children?: React.ReactNode; className?: string }) => (
  <TableHead className={`font-mono text-[11px] font-normal tracking-widest whitespace-nowrap text-muted-foreground uppercase ${className ?? ""}`}>
    {children}
  </TableHead>
);

const SECURITY = [{ value: "definer", label: "Definer" }, { value: "invoker", label: "Invoker" }];
const isTrigger = (f: DbFunction) => f.result === "trigger" || f.result === "event_trigger";

/** Database › Functions, as the original lists them. One schema, searched and filtered in the browser. */
export function FunctionsPage({ projectRef, projectName }: { projectRef: string; projectName: string }) {
  const [schema, setSchema] = useSchemaParam();
  const [search, setSearch] = useState("");
  const [returnTypes, setReturnTypes] = useState<string[]>([]);
  const [security, setSecurity] = useState<string[]>([]);
  const [target, setTarget] = useState<FunctionTarget | null>(null);
  const [dropping, setDropping] = useState<DbFunction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const refresh = useRefreshTable(projectRef);

  const state = useProjectPart<DbFunction[]>(projectRef, "db-functions", { schema });
  const all = state.status === "ready" ? state.data : [];
  const needle = search.trim().toLowerCase();
  const shown = all.filter(
    (f) =>
      (!needle || f.name.toLowerCase().includes(needle) || f.definition.toLowerCase().includes(needle)) &&
      (returnTypes.length === 0 || returnTypes.includes(f.result ?? "")) &&
      (security.length === 0 || security.includes(f.securityDefiner ? "definer" : "invoker")),
  );
  const resultOptions = [...new Set(all.map((f) => f.result).filter((r): r is string => !!r))].sort().map((r) => ({ value: r, label: r }));

  const confirmDrop = () =>
    start(async () => {
      if (!dropping) return;
      try {
        const res = await dropFunction(projectRef, schema, dropping.name, dropping.identity);
        if (!res.ok) return setError(res.reason);
        setDropping(null);
        refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the functions.");
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SchemaSelect projectRef={projectRef} schema={schema} onChange={setSchema} />
        <div className="relative">
          <IconSearch className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for a function" className="h-8 w-60 pl-8" />
        </div>
        <CheckboxFilter label="Return Type" title="Select return types" options={resultOptions} value={returnTypes} onChange={setReturnTypes} />
        <CheckboxFilter label="Security" title="Select security" options={SECURITY} value={security} onChange={setSecurity} />
        <Button size="sm" className="ml-auto gap-1.5" onClick={() => setTarget({ mode: "create" })}>
          <IconPlus size={14} /> New function
        </Button>
      </div>

      {isWaiting(state) ? (
        <Skeleton className="h-40 w-full" />
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Head>Name</Head>
                <Head>Type</Head>
                <Head>Arguments</Head>
                <Head>Return type</Head>
                <Head className="w-28">Security</Head>
                <Head className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {all.length === 0 ? `No functions found in the schema "${schema}"` : `No results found for "${search.trim()}"`}
                  </TableCell>
                </TableRow>
              ) : (
                shown.map((f) => (
                  <TableRow key={`${f.name}(${f.identity})`}>
                    <TableCell className="max-w-64 truncate">
                      <button type="button" onClick={() => setTarget({ mode: "edit", fn: f })} title={f.name}
                        className="text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground">
                        {f.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground capitalize">{f.kind}</TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground" title={f.args}>{f.args || "–"}</TableCell>
                    <TableCell className="max-w-48 truncate text-muted-foreground" title={f.result ?? ""}>{f.result ?? "–"}</TableCell>
                    <TableCell className="text-muted-foreground">{f.securityDefiner ? "Definer" : "Invoker"}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="px-1.5" aria-label={`${f.name} actions`}>
                            <IconDotsVertical size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {schema === "public" && !isTrigger(f) ? (
                            <>
                              <DropdownMenuItem asChild>
                                <a href={`https://supabase.com/dashboard/project/${projectRef}/api?rpc=${encodeURIComponent(f.name)}`} target="_blank" rel="noreferrer">
                                  <IconFileText size={14} /> Client API docs <IconArrowUpRight size={12} className="ml-auto" />
                                </a>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                            </>
                          ) : null}
                          <DropdownMenuItem onSelect={() => setTarget({ mode: "edit", fn: f })}>
                            <IconEdit size={14} /> Edit function
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setTarget({ mode: "duplicate", fn: f })}>
                            <IconCopy size={14} /> Duplicate function
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => { setError(null); setDropping(f); }}>
                            <IconTrash size={14} /> Delete function
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <FunctionPanel target={target} onClose={() => setTarget(null)} projectRef={projectRef} projectName={projectName} schema={schema} />

      <DdlConfirm
        open={dropping !== null}
        onOpenChange={(next) => !next && setDropping(null)}
        action={`Delete function ${dropping?.name ?? ""}`}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={dropping?.name ?? ""}
        sql={dropping ? dropFunctionSql(dropping) : null}
        warning={<p>You cannot recover this function once deleted.</p>}
        busy={busy}
        error={error}
        onConfirm={confirmDrop}
      />
    </div>
  );
}
