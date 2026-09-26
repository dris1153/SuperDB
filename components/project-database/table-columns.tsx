"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  IconChevronLeft,
  IconDiamond,
  IconDiamondFilled,
  IconFingerprint,
  IconHash,
  IconKey,
  IconLink,
  IconSearch,
} from "@tabler/icons-react";
import type { TableColumn } from "@/lib/table-entities";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";

const Head = ({ children }: { children?: React.ReactNode }) => (
  <TableHead className="font-mono text-[11px] font-normal tracking-widest whitespace-nowrap text-muted-foreground uppercase">
    {children}
  </TableHead>
);

const Token = ({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground">
    {icon}
    {children}
  </span>
);

/** One table's columns, read only, as the original's columns page lists them. */
export function TableColumns({ projectRef, table }: { projectRef: string; table: string }) {
  const schema = useSearchParams().get("schema") || "public";
  const [filter, setFilter] = useState("");
  const state = useProjectPart<{ found: boolean; columns: TableColumn[] }>(projectRef, "table-columns", { schema, table });

  const needle = filter.trim().toLowerCase();
  const columns = state.status === "ready" ? state.data.columns.filter((c) => c.name.toLowerCase().includes(needle)) : [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href={`/p/${projectRef}/database/tables?schema=${encodeURIComponent(schema)}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <IconChevronLeft size={14} /> Tables
        </Link>
        <h1 className="text-2xl text-foreground">
          <span className="text-muted-foreground">{schema}.</span>
          {table}
        </h1>
      </header>

      <div className="relative w-52">
        <IconSearch className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter columns" className="h-8 pl-8" />
      </div>

      {isWaiting(state) ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : !state.data.found ? (
        <Empty>There is no table {schema}.{table}.</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Head>Name</Head>
                <Head>Type</Head>
                <Head>Constraints</Head>
              </TableRow>
            </TableHeader>
            <TableBody>
              {columns.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                    {needle ? `No results found for "${filter.trim()}"` : "This table has no columns"}
                  </TableCell>
                </TableRow>
              ) : (
                columns.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="max-w-72">
                      <div className="truncate text-foreground">{c.name}</div>
                      {c.comment ? <div className="truncate text-xs text-muted-foreground">{c.comment}</div> : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{c.type}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {c.primary ? <Token icon={<IconKey size={12} />}>Primary key</Token> : null}
                        {c.foreign ? <Token icon={<IconLink size={12} />}>Foreign key</Token> : null}
                        {c.unique ? <Token icon={<IconFingerprint size={12} />}>Unique</Token> : null}
                        {c.identity ? <Token icon={<IconHash size={12} />}>Identity</Token> : null}
                        {c.nullable ? (
                          <Token icon={<IconDiamond size={12} />}>Nullable</Token>
                        ) : (
                          <Token icon={<IconDiamondFilled size={12} />}>Non-nullable</Token>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
