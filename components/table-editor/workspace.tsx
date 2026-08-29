import type { Policy, TableEntry } from "@/lib/table-editor";
import type { RowCount, RowRecord } from "@/lib/table-rows";
import type { ColumnInfo, Filter, SortKey } from "@/lib/table-view";
import { Empty } from "@/components/ui/empty-state";
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
  schema,
  entry,
  columns,
  rows,
  sort,
  filters,
  policies,
  total,
  page,
  size,
  view,
  definition,
}: {
  projectRef: string;
  schema: string;
  entry: TableEntry;
  columns: ColumnInfo[];
  rows: RowRecord[] | null;
  sort: SortKey[];
  filters: Filter[];
  policies: Policy[];
  total: RowCount | null;
  page: number;
  size: number;
  view: "data" | "definition";
  /** Only fetched when the definition tab is the one being looked at. */
  definition: { ddl: string; html: string | null; complete: boolean } | null;
}) {
  if (view === "definition") {
    return (
      <>
        <Toolbar
          table={entry.name}
          rls={entry.rls}
          policies={policies}
          columns={columns}
          filters={filters}
          sort={sort}
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
        table={entry.name}
        rls={entry.rls}
        policies={policies}
        columns={columns}
        filters={filters}
        sort={sort}
      />

      {!rows ? (
        <div className="p-6">
          <Empty>
            Could not read {schema}.{entry.name}.
          </Empty>
        </div>
      ) : (
        <>
          <div className="relative min-h-0 flex-1">
            <TableGrid
              projectRef={projectRef}
              schema={schema}
              table={entry.name}
              columns={columns}
              rows={rows}
              sort={sort}
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
