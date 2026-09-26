"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconChevronLeft, IconPlus, IconSearch } from "@tabler/icons-react";
import { isWritableTable, type TableColumns as ColumnsPart } from "@/lib/table-entities";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";
import { ColumnPanel } from "@/components/table-editor/column-panel";
import { ColumnRowActions } from "./column-row-actions";
import { ConstraintTokens, TypeIcon } from "./column-tokens";

const Head = ({ children }: { children?: React.ReactNode }) => (
  <TableHead className="font-mono text-[11px] font-normal tracking-widest whitespace-nowrap text-muted-foreground uppercase">
    {children}
  </TableHead>
);

/**
 * One table's columns, laid out as the original has them. New column, Edit and Delete are the
 * Table Editor's own sheets and confirms — only offered on an ordinary or partitioned table.
 */
export function TableColumns({ projectRef, projectName, table }: { projectRef: string; projectName: string; table: string }) {
  const schema = useSearchParams().get("schema") || "public";
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const state = useProjectPart<ColumnsPart>(projectRef, "table-columns", { schema, table });
  const data = state.status === "ready" ? state.data : null;
  const writable = !!data?.kind && isWritableTable(data.kind);

  const needle = filter.trim().toLowerCase();
  const columns = data ? data.columns.filter((c) => c.name.toLowerCase().includes(needle)) : [];

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <Link
          href={`/p/${projectRef}/database/tables?schema=${encodeURIComponent(schema)}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconChevronLeft size={14} /> Tables
        </Link>
        <h1 className="text-2xl text-foreground">{table}</h1>
      </header>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative w-64">
            <IconSearch className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter columns" className="h-8 pl-8" />
          </div>
          {writable ? (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setAdding(true)}>
              <IconPlus size={14} /> New column
            </Button>
          ) : null}
        </div>

        {isWaiting(state) ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !data ? (
          <Empty>{reasonOf(state)}</Empty>
        ) : !data.found ? (
          <Empty>There is no table {schema}.{table}.</Empty>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <Head />
                  <Head>Name</Head>
                  <Head>Type</Head>
                  <Head>Constraints</Head>
                  <Head />
                </TableRow>
              </TableHeader>
              <TableBody>
                {columns.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      {needle ? `No results found for "${filter.trim()}"` : `There are no columns in "${schema}.${table}"`}
                    </TableCell>
                  </TableRow>
                ) : (
                  columns.map((c) => {
                    return (
                      <TableRow key={c.name} className="h-[73px]">
                        <TableCell className="w-0 pr-1 pl-6">
                          <TypeIcon type={c.type} />
                        </TableCell>
                        <TableCell className="max-w-72">
                          <div className="truncate text-foreground">{c.name}</div>
                          {c.comment ? <div className="truncate text-xs text-muted-foreground">{c.comment}</div> : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{c.type}</TableCell>
                        <TableCell>
                          <ConstraintTokens column={c} />
                        </TableCell>
                        <TableCell className="pr-4">
                          {writable ? (
                            <ColumnRowActions
                              projectRef={projectRef}
                              projectName={projectName}
                              schema={schema}
                              table={table}
                              column={c.name}
                              columnCount={data.columns.length}
                              onEdit={() => setEditing(c.name)}
                            />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            <div className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
              {columns.length} {columns.length === 1 ? "column" : "columns"}
            </div>
          </div>
        )}
      </div>

      {writable ? (
        <>
          <ColumnPanel open={adding} column={null} onClose={() => setAdding(false)} projectRef={projectRef} projectName={projectName} schema={schema} table={table} />
          <ColumnPanel open={editing !== null} column={editing} onClose={() => setEditing(null)} projectRef={projectRef} projectName={projectName} schema={schema} table={table} />
        </>
      ) : null}
    </div>
  );
}
