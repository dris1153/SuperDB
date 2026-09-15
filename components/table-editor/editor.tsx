"use client";

import { useSearchParams } from "next/navigation";
import type { Policy, TableEntry } from "@/lib/table-editor";
import type { RowCount, RowRecord } from "@/lib/table-rows";
import type { ColumnInfo } from "@/lib/table-view";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, parseSort } from "@/lib/table-view";
import { parseFilters } from "@/lib/table-filter";
import { TableEmpty } from "./table-empty";
import { TablesSidebar } from "./sidebar";
import { TabBar } from "./tab-bar";
import { TableWorkspace } from "./workspace";
import { TableUrlProvider } from "./url";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";

type Schemas = { schemas: string[]; exposed: string[] | null };
type Rows = { rows: RowRecord[]; total: RowCount; page: number; size: number };
type Definition = { ddl: string; html: string | null; complete: boolean } | null;

/**
 * The query layer for the table editor.
 *
 * Everything below it — the sidebar, the toolbar, the grid, the footer — keeps taking the same props
 * it always did. This component is what used to be the page: it reads the URL, asks for the parts,
 * and hands the answers down.
 *
 * **No part is asked for using another part's answer.** The URL is the only input any of them take.
 * The chain that used to run down the page — schemas, then tables, then columns, then rows — still
 * runs, but inside the `rows` reader on the server, where the four hops cost four upstream calls
 * instead of four browser round trips.
 *
 * Paging, sorting, filtering and searching are now query-key changes rather than navigations, which
 * is the part of this page that gets genuinely faster: every one of them used to re-render the whole
 * page on the server.
 */
export function TableEditor({ projectRef, projectName }: { projectRef: string; projectName: string }) {
  const params = useSearchParams();
  const query = params.toString();

  const catalog = useProjectPart<Schemas>(projectRef, "schemas");
  const schemas = catalog.status === "ready" ? catalog.data.schemas : [];

  /**
   * **The URL is what the queries are keyed on, not another query's answer.**
   *
   * The first version of this file validated the schema against the catalog and read the table out
   * of the table list before asking for anything — so a cold load of `?schema=public&table=users`
   * spent two serial round trips before the first row was requested, which is exactly the chain this
   * phase moved to the server. The URL already says which table to fetch; the catalog is only needed
   * to *correct* it, and correcting it is a rendering concern.
   *
   * Once the catalog is in, a schema this database does not have falls back the way the server page
   * did. Until then the URL's own value is used, which is right on every load that is not a typo.
   */
  const urlSchema = params.get("schema");
  const urlTable = params.get("table");

  const schema =
    catalog.status === "ready"
      ? urlSchema && schemas.includes(urlSchema)
        ? urlSchema
        : schemas.includes("public")
          ? "public"
          : (schemas[0] ?? "")
      : (urlSchema ?? "");

  const tables = useProjectPart<TableEntry[]>(projectRef, "schema-tables", { schema }, {
    enabled: schema !== "",
  });
  const list = tables.status === "ready" ? tables.data : [];

  // A table named in the URL that is not in this schema is reported, not quietly replaced by the
  // first one: falling back would drop the filters that came with it and show unrelated rows as if
  // they were the answer. Asked for on the URL's word, corrected when the list arrives.
  const table =
    tables.status === "ready"
      ? urlTable && list.some((t) => t.name === urlTable)
        ? urlTable
        : urlTable
          ? ""
          : (list[0]?.name ?? "")
      : (urlTable ?? "");

  const entry = table ? (list.find((t) => t.name === table) ?? null) : null;
  const missing = urlTable != null && tables.status === "ready" && table === "";

  const view: "data" | "definition" = params.get("view") === "definition" ? "definition" : "data";
  const target = { schema, table };

  const columns = useProjectPart<ColumnInfo[]>(projectRef, "columns", target, { enabled: !!table });
  const policies = useProjectPart<Policy[]>(projectRef, "policies", target, { enabled: !!table });
  const rows = useProjectPart<Rows | null>(projectRef, "rows", rowsParams(params, schema, table), {
    enabled: !!table && view === "data",
    keepPrevious: true,
  });
  const definition = useProjectPart<Definition>(projectRef, "definition", target, {
    enabled: !!table && view === "definition",
    keepPrevious: true,
  });

  // The reader answers null for a table that is no longer there — dropped in another tab, or by the
  // drop in this one — and that is a different thing from a refusal.
  const page = rows.status === "ready" && rows.data ? rows.data : null;

  // The server's page and size win once they arrive: it clamps the page to the last real one, and
  // disagreeing with it would put "Page 900 of 3" under a grid showing page 3.
  const size = PAGE_SIZES.includes(Number(params.get("size")) as (typeof PAGE_SIZES)[number])
    ? Number(params.get("size"))
    : DEFAULT_PAGE_SIZE;
  const search = (params.get("q") ?? "").trim();

  /**
   * What the toolbar's chips show. The authoritative filter happens in the `rows` reader, against
   * the catalog, before any SQL is built — this copy is display only, and it deliberately does not
   * hide a filter while the column list is still in flight: chips vanishing over filtered rows is a
   * worse lie than a chip naming a column that turns out not to exist.
   */
  const known = columns.status === "ready" ? new Set(columns.data.map((c) => c.name)) : null;
  const sort = parseSort(params.get("sort")).filter((s) => !known || known.has(s.column));
  const filters = parseFilters(params.getAll("filter")).filter((f) => !known || known.has(f.column));

  // Only the parts that were actually asked for: a disabled query reports `idle`, and counting it as
  // busy left the sidebar dimmed and the search box disabled for as long as the Definition tab was
  // open.
  const busy = [catalog, tables, rows, columns].some((part) => part.status === "pending");

  if (catalog.status === "refused" || catalog.status === "failed") {
    return <TableEmpty>{catalog.reason}</TableEmpty>;
  }
  if (catalog.status === "ready" && schemas.length === 0) {
    return (
      <TableEmpty>
        Could not read this database. Paused projects and restricted tokens return nothing here.
      </TableEmpty>
    );
  }

  return (
    <TableUrlProvider current={query} pending={busy}>
      <div className="flex h-full">
        <TablesSidebar
          schemas={schemas}
          schema={schema}
          tables={list}
          table={entry?.name ?? null}
          exposed={catalog.status === "ready" && catalog.data.exposed ? catalog.data.exposed.includes(schema) : null}
          projectRef={projectRef}
          projectName={projectName}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TabBar projectRef={projectRef} schema={schema} table={entry?.name ?? null} />

          {!entry ? (
            <TableEmpty>
              {tables.status === "pending" || tables.status === "idle"
                ? "Loading…"
                : missing
                  ? `No table or view named ${urlTable} in schema ${schema}.`
                  : `No tables or views in schema ${schema}.`}
            </TableEmpty>
          ) : (
            <TableWorkspace
              projectRef={projectRef}
              projectName={projectName}
              schema={schema}
              entry={entry}
              schemas={schemas}
              columns={columns.status === "ready" ? columns.data : []}
              rows={page ? page.rows : null}
              rowsPending={rows.status === "pending" || rows.status === "idle"}
              sort={sort}
              filters={filters}
              search={search}
              urlQuery={{
                sort: params.get("sort") ?? undefined,
                filter: params.getAll("filter"),
                // Trimmed, like the reader trims it: an untrimmed `q` here would export a different
                // set of rows from the one on screen.
                search: search || undefined,
              }}
              policies={policies.status === "ready" ? policies.data : []}
              total={page ? page.total : null}
              page={page ? page.page : 1}
              size={page ? page.size : size}
              view={view}
              definition={definition.status === "ready" ? definition.data : null}
              definitionPending={isWaiting(definition)}
              definitionReason={reasonOf(definition)}
              // Only an ordinary table with a primary key can have one of its rows addressed. A view
              // and a keyless table each fail for their own reason, which the toolbar states.
              editable={
                entry.kind === "r" &&
                columns.status === "ready" &&
                columns.data.some((c) => c.pk_pos != null)
              }
            />
          )}
        </div>
      </div>
    </TableUrlProvider>
  );
}

/**
 * The whole view state, so a sort or a page is a different query rather than a refetch of the same
 * one. `URLSearchParams` rather than a record, because `filter` repeats.
 */
function rowsParams(params: URLSearchParams, schema: string, table: string): URLSearchParams {
  const out = new URLSearchParams({ schema, table });
  for (const key of ["page", "size", "sort", "q"]) {
    const value = params.get(key);
    if (value) out.set(key, value);
  }
  for (const filter of params.getAll("filter")) out.append("filter", filter);
  return out;
}
