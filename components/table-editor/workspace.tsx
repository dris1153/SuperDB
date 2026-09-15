import type { Policy, TableEntry } from "@/lib/table-editor";
import type { RowCount, RowRecord } from "@/lib/table-rows";
import type { ColumnInfo, SortKey } from "@/lib/table-view";
import type { Filter } from "@/lib/table-filter";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { ROW_HEIGHT, useDensity } from "./column-prefs";
import { Definition } from "./definition";
import { TableFooter } from "./footer";
import { TableGrid } from "./grid";
import { Toolbar } from "./toolbar";

/**
 * Everything to the right of the sidebar for one selected table. Split out of the route so the page
 * stays a readable list of queries rather than queries plus a layout tree.
 */
export function TableWorkspace({
  projectRef,
  projectName,
  schema,
  entry,
  schemas,
  columns,
  rows,
  rowsPending,
  sort,
  filters,
  search,
  urlQuery,
  policies,
  total,
  page,
  size,
  view,
  definition,
  editable,
}: {
  projectRef: string;
  projectName: string;
  schema: string;
  entry: TableEntry;
  schemas: string[];
  columns: ColumnInfo[];
  rows: RowRecord[] | null;
  /** No rows *yet* is not the same as no rows: one is a wait, the other is an answer. */
  rowsPending: boolean;
  sort: SortKey[];
  filters: Filter[];
  search: string;
  urlQuery: { sort?: string; filter?: string[]; search?: string };
  policies: Policy[];
  total: RowCount | null;
  page: number;
  size: number;
  view: "data" | "definition";
  /** A view has no rows to address, and neither does a table without a primary key. */
  editable: boolean;
  /** Only fetched when the definition tab is the one being looked at. */
  definition: { ddl: string; html: string | null; complete: boolean } | null;
}) {
  // Read here as well as in the grid so the placeholder's rules land on the same pitch the real rows
  // will use. A fixed pitch would redraw itself the moment the answer arrived.
  const { density } = useDensity();

  if (view === "definition") {
    return (
      <>
        <Toolbar
          projectRef={projectRef}
          schema={schema}
          table={entry.name}
          rls={entry.rls}
          policies={policies}
          columns={columns}
          filters={filters}
          sort={sort}
          search={search}
          urlQuery={urlQuery}
          page={page}
          size={size}
          projectName={projectName}
          editable={editable}
          isView={entry.kind === "v" || entry.kind === "m"}
        />
        <Definition
          ddl={definition?.ddl ?? null}
          html={definition?.html ?? null}
          complete={definition?.complete ?? true}
        />
        <TableFooter
          page={page}
          size={size}
          rowsOnPage={0}
          total={total?.n ?? null}
          exact={total?.exact ?? false}
          view={view}
        />
      </>
    );
  }

  return (
    <>
      <Toolbar
        projectRef={projectRef}
        schema={schema}
        table={entry.name}
        rls={entry.rls}
        policies={policies}
        columns={columns}
        filters={filters}
        sort={sort}
        search={search}
        urlQuery={urlQuery}
        page={page}
        size={size}
        projectName={projectName}
        editable={editable}
        isView={entry.kind === "v" || entry.kind === "m"}
      />

      {!rows ? (
        rowsPending ? (
          // Shaped like the grid it is waiting for, and sized by the same box: a fixed-height block
          // in a padded box left a 384px placeholder where a grid the height of the window was about
          // to land, and everything below it jumped when it did.
          <>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="h-10 shrink-0 border-b border-border bg-card" />
              <SkeletonRows rowHeight={ROW_HEIGHT[density]} className="min-h-0 flex-1" />
            </div>
            {/* The real footer would print "count unavailable" here, which is a claim about the
                answer rather than about the wait. Its height is what has to be held. */}
            <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-2">
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="ml-auto h-7 w-36" />
            </div>
          </>
        ) : (
          <div className="p-6">
            <Empty>
              Could not read {schema}.{entry.name}.
            </Empty>
          </div>
        )
      ) : (
        <>
          <div className="relative min-h-0 flex-1">
            <TableGrid
              projectRef={projectRef}
              projectName={projectName}
              schema={schema}
              table={entry.name}
              schemas={schemas}
              columns={columns}
              rows={rows}
              sort={sort}
              editable={editable}
            />
            {rows.length === 0 ? (
              <p className="pointer-events-none absolute inset-x-0 top-24 text-center text-sm text-subtle">
                {filters.length > 0
                  ? "No rows match these filters."
                  : page > 1
                    ? "No rows on this page."
                    : "This table is empty."}
              </p>
            ) : null}
          </div>
          <TableFooter
            page={page}
            size={size}
            rowsOnPage={rows.length}
            total={total?.n ?? null}
            exact={total?.exact ?? false}
            view={view}
          />
        </>
      )}
    </>
  );
}
