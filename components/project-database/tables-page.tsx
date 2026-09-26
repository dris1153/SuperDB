"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconCheck,
  IconEye,
  IconLayersSubtract,
  IconPlus,
  IconSearch,
  IconStack2,
  IconTable,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { ALL_KINDS, ENTITY_TYPES, filterEntities, noneFoundSentence, type Entity, type EntityKind } from "@/lib/table-entities";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";
import { NewTableSheet } from "@/components/table-editor/new-table-sheet";
import { EntityTypeFilter } from "./entity-type-filter";
import { SchemaSelect, useSchemaParam } from "./schema-select";
import { TableRowMenu } from "./table-row-menu";

const ICONS: Record<EntityKind, typeof IconTable> = {
  r: IconTable,
  v: IconEye,
  m: IconStack2,
  f: IconWorld,
  p: IconLayersSubtract,
};

/** The original's header style: small, uppercase, letter-spaced, mono. */
const Head = ({ children }: { children?: React.ReactNode }) => (
  <TableHead className="font-mono text-[11px] font-normal tracking-widest whitespace-nowrap text-muted-foreground uppercase">
    {children}
  </TableHead>
);

/** Database › Tables, as the original lays it out. One schema at a time, filtered in the browser. */
export function TablesPage({ projectRef, projectName }: { projectRef: string; projectName: string }) {
  const [schema, setSchema] = useSchemaParam();
  const [search, setSearch] = useState("");
  const [kinds, setKinds] = useState<EntityKind[]>(ALL_KINDS);
  const [creating, setCreating] = useState(false);

  const state = useProjectPart<Entity[]>(projectRef, "schema-entities", { schema });
  const all = state.status === "ready" ? state.data : [];
  const shown = filterEntities(all, search, kinds);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SchemaSelect projectRef={projectRef} schema={schema} onChange={setSchema} />
        <div className="relative">
          <IconSearch className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search for a table" className="h-8 w-52 pl-8" />
        </div>
        <EntityTypeFilter value={kinds} onChange={setKinds} />
        <Button size="sm" className="ml-auto gap-1.5" onClick={() => setCreating(true)}>
          <IconPlus size={14} /> New table
        </Button>
      </div>

      {isWaiting(state) ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <Head />
                <Head>Name</Head>
                <Head>Columns</Head>
                <Head>Rows (estimated)</Head>
                <Head>Size (estimated)</Head>
                <Head>Realtime</Head>
                <Head />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                    {all.length === 0
                      ? "No tables created yet"
                      : search.trim()
                        ? `No results found for "${search.trim()}"`
                        : noneFoundSentence(kinds, schema)}
                  </TableCell>
                </TableRow>
              ) : (
                shown.map((e) => <EntityRow key={e.name} projectRef={projectRef} projectName={projectName} schema={schema} entity={e} />)
              )}
            </TableBody>
          </Table>
          <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
            {shown.length} {shown.length === 1 ? "table" : "tables"}
          </div>
        </div>
      )}

      <NewTableSheet open={creating} onOpenChange={setCreating} projectRef={projectRef} projectName={projectName} schema={schema} />
    </div>
  );
}

function EntityRow({ projectRef, projectName, schema, entity: e }: { projectRef: string; projectName: string; schema: string; entity: Entity }) {
  const Icon = ICONS[e.kind];
  const label = ENTITY_TYPES.find((t) => t.kind === e.kind)?.label;
  const columnsHref = `/p/${projectRef}/database/tables/${encodeURIComponent(e.name)}?schema=${encodeURIComponent(schema)}`;

  return (
    <TableRow>
      <TableCell className="w-0 pr-1 pl-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex w-4 justify-center text-muted-foreground" aria-label={label}>
              <Icon size={16} stroke={1.5} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
      </TableCell>
      <TableCell className="max-w-72">
        <div className="truncate text-foreground" title={e.name}>
          {e.name}
        </div>
        {e.comment ? (
          <div className="truncate text-xs text-muted-foreground" title={e.comment}>
            {e.comment}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-muted-foreground">{e.columns.toLocaleString()}</TableCell>
      <TableCell className="text-muted-foreground">{e.rows == null ? "–" : e.rows.toLocaleString()}</TableCell>
      <TableCell className="text-muted-foreground">{e.size ?? "–"}</TableCell>
      <TableCell>
        {e.realtime ? (
          <span className="flex items-center gap-2 text-foreground">
            <IconCheck size={16} className="text-primary" /> Enabled
          </span>
        ) : (
          <span className="flex items-center gap-2 text-muted-foreground">
            <IconX size={16} /> Disabled
          </span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={columnsHref}>View columns</Link>
          </Button>
          <TableRowMenu projectRef={projectRef} projectName={projectName} schema={schema} entity={e} />
        </div>
      </TableCell>
    </TableRow>
  );
}
