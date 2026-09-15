"use client";

import { IconLock, IconLockOpen } from "@tabler/icons-react";
import type { TableRow as TableInfo } from "@/lib/db-introspect";
import { bytes, count } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProjectPart } from "@/components/use-project-part";

const HEAD = "text-xs font-normal text-subtle";
const COLUMNS = ["Schema", "Table", "Rows (est.)", "Size", "Columns", "RLS"];

/**
 * Every user table, with the one fact worth spotting: whether row level security is off on a table
 * in `public` — the schema PostgREST serves.
 *
 * The same query the stats above run, so the count and the list are one answer rather than two that
 * could disagree.
 */
export function DatabaseTables({ projectRef }: { projectRef: string }) {
  const tables = useProjectPart<TableInfo[]>(projectRef, "tables");

  return (
    <section className="space-y-2">
      <h2 className="text-sm text-muted-foreground">Tables</h2>

      {tables.status === "pending" ? (
        // Roughly a header and six rows, which is what an ordinary project fills. A third of that
        // would move everything below it when the list lands.
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : tables.status !== "ready" ? (
        <Empty>
          Could not query this database. Paused projects and restricted tokens return nothing here.
          <span className="mt-1 block text-xs">{tables.reason}</span>
        </Empty>
      ) : !Array.isArray(tables.data) || tables.data.length === 0 ? (
        <Empty>No user tables yet.</Empty>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <Table className="min-w-2xl">
            <TableHeader className="bg-card">
              <TableRow className="hover:bg-transparent">
                {COLUMNS.map((column) => (
                  <TableHead key={column} className={HEAD}>
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables.data.map((table) => (
                <TableRow key={`${table.schema}.${table.name}`}>
                  <TableCell className="font-mono text-xs text-subtle">{table.schema}</TableCell>
                  <TableCell className="text-foreground">{table.name}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {count(table.est_rows)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {bytes(table.total_bytes)}
                  </TableCell>
                  <TableCell className="tabular-nums text-subtle">{table.columns}</TableCell>
                  <TableCell>
                    {table.rls ? (
                      <Badge variant="outline" className="rounded-full border-brand-border text-primary">
                        <IconLock size={12} stroke={1.5} /> on
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={
                          // Warned about only in public: RLS off on an internal schema is ordinary,
                          // off on the one PostgREST serves is the finding.
                          table.schema === "public"
                            ? "rounded-full border-warn/40 text-warn"
                            : "rounded-full"
                        }
                      >
                        <IconLockOpen size={12} stroke={1.5} /> off
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
