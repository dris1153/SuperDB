"use client";

import { useState, useTransition } from "react";
import { IconBook, IconDotsVertical, IconEdit, IconSearch, IconTrash } from "@tabler/icons-react";
import { dropEnumSql, type EnumType } from "@/lib/enum-statements";
import { dropEnum } from "@/lib/enum-actions";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";
import { DdlConfirm } from "@/components/table-editor/ddl-confirm";
import { useRefreshTable } from "@/components/table-editor/use-refresh-table";
import { EnumTypeSheet } from "./enum-type-sheet";
import { SchemaSelect, useSchemaParam } from "./schema-select";

const Head = ({ children }: { children?: React.ReactNode }) => (
  <TableHead className="font-mono text-[11px] font-normal tracking-widest whitespace-nowrap text-muted-foreground uppercase">
    {children}
  </TableHead>
);

/** Database › Enumerated Types, as the original lists them. */
export function EnumTypesPage({ projectRef, projectName }: { projectRef: string; projectName: string }) {
  const [schema, setSchema] = useSchemaParam();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EnumType | null>(null);
  const [creating, setCreating] = useState(false);
  const [dropping, setDropping] = useState<EnumType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const refresh = useRefreshTable(projectRef);

  const state = useProjectPart<EnumType[]>(projectRef, "enum-types", { schema });
  const needle = search.trim().toLowerCase();
  const types = state.status === "ready" ? state.data.filter((t) => t.name.toLowerCase().includes(needle)) : [];

  const confirmDrop = () =>
    start(async () => {
      if (!dropping) return;
      try {
        const res = await dropEnum(projectRef, schema, dropping.name);
        if (!res.ok) return setError(res.reason);
        setDropping(null);
        refresh();
      } catch {
        setError("The request failed before it answered. Reload and check the types.");
      }
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SchemaSelect projectRef={projectRef} schema={schema} onChange={setSchema} />
        <div className="relative">
          <IconSearch className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for a type" className="h-8 w-60 pl-8" />
        </div>
        <div className="ml-auto flex gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href="https://www.postgresql.org/docs/current/datatype-enum.html" target="_blank" rel="noreferrer">
              <IconBook size={14} /> Docs
            </a>
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            Create type
          </Button>
        </div>
      </div>

      {isWaiting(state) ? (
        <Skeleton className="h-24 w-full" />
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Head>Schema</Head>
                <Head>Name</Head>
                <Head>Values</Head>
                <Head />
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-4">
                    {needle ? (
                      <p className="text-sm text-muted-foreground">No results found for &quot;{search.trim()}&quot;</p>
                    ) : (
                      <>
                        <p className="text-sm text-foreground">No enumerated types created yet</p>
                        <p className="text-sm text-muted-foreground">There are no enumerated types found in the schema &quot;{schema}&quot;</p>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                types.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="w-40 truncate text-muted-foreground">{schema}</TableCell>
                    <TableCell className="text-foreground">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground">{t.values.join(", ")}</TableCell>
                    <TableCell className="w-0">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="px-1.5" aria-label={`${t.name} actions`}>
                            <IconDotsVertical size={14} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem onSelect={() => setEditing(t)}>
                            <IconEdit size={14} /> Update type
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" onSelect={() => { setError(null); setDropping(t); }}>
                            <IconTrash size={14} /> Delete type
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

      <EnumTypeSheet open={creating || editing !== null} type={editing} onClose={() => { setCreating(false); setEditing(null); }}
        projectRef={projectRef} projectName={projectName} schema={schema} />

      <DdlConfirm
        open={dropping !== null}
        onOpenChange={(next) => !next && setDropping(null)}
        action={`Delete enumerated type ${dropping?.name ?? ""}`}
        projectName={projectName}
        projectRef={projectRef}
        schema={schema}
        table={dropping?.name ?? ""}
        sql={dropping ? dropEnumSql(schema, dropping.name) : null}
        warning={
          <p>
            This cannot be undone — you would need to re-create the type. Before deleting it, check it is no longer used
            in any tables or functions; Postgres refuses the drop while a column still uses it.
          </p>
        }
        busy={busy}
        error={error}
        onConfirm={confirmDrop}
      />
    </div>
  );
}
