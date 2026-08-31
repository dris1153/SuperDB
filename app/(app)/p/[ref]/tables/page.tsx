import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { getExposedSchemas } from "@/lib/mgmt-api";
import { describeTable, listPolicies, listSchemas, listTablesIn } from "@/lib/table-editor";
import { rowCount, selectRows } from "@/lib/table-rows";
import { tableDefinition } from "@/lib/table-ddl";
import { highlight } from "@/lib/highlight";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, parseSort } from "@/lib/table-view";
import { parseFilters } from "@/lib/table-filter";
import { exportQuery, queryString } from "@/lib/table-query";
import { clampInt } from "@/lib/sql-ident";
import { safe } from "@/lib/safe";
import { TableEmpty } from "@/components/table-editor/table-empty";
import { TablesSidebar } from "@/components/table-editor/sidebar";
import { TabBar } from "@/components/table-editor/tab-bar";
import { TableWorkspace } from "@/components/table-editor/workspace";
import { TableUrlProvider } from "@/components/table-editor/url";

export const dynamic = "force-dynamic";

type Query = {
  schema?: string;
  table?: string;
  page?: string;
  size?: string;
  sort?: string;
  filter?: string | string[];
  view?: string;
  q?: string;
};

export default async function TablesPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<Query>;
}) {
  const [{ ref }, query] = await Promise.all([params, searchParams]);
  const found = await resolveProject(ref);
  if (!found) notFound();
  const { token, project } = found;

  const schemas = (await safe(() => listSchemas(token, ref))) ?? [];
  if (schemas.length === 0) {
    return (
      <TableEmpty>
        Could not read this database. Paused projects and restricted tokens return nothing here.
      </TableEmpty>
    );
  }

  // A name that is not in the catalog is never queried. Quoting keeps a hostile name inert; this is
  // what keeps an unknown one from being asked about at all.
  const schema =
    query.schema && schemas.includes(query.schema)
      ? query.schema
      : schemas.includes("public")
        ? "public"
        : schemas[0];

  const [tables, postgrest] = await Promise.all([
    safe(() => listTablesIn(token, ref, schema)).then((t) => t ?? []),
    safe(() => getExposedSchemas(token, ref)),
  ]);

  // A table named in the URL that is not in this schema is reported, not quietly replaced by the
  // first one. Falling back would drop the filters that came with it and show unrelated rows as if
  // they were the answer — which is exactly what a foreign key into a partition would produce.
  const named = query.table ? tables.find((t) => t.name === query.table) : undefined;
  const missing = query.table != null && named == null;
  const entry = named ?? (query.table ? null : (tables[0] ?? null));

  // Null rather than false when the setting is unreadable: an icon that guesses is worse than none.
  const exposed = postgrest ? postgrest.includes(schema) : null;

  const size = PAGE_SIZES.includes(Number(query.size) as (typeof PAGE_SIZES)[number])
    ? Number(query.size)
    : DEFAULT_PAGE_SIZE;
  const requestedPage = clampInt(query.page, 1, Number.MAX_SAFE_INTEGER, 1);
  const view: "data" | "definition" = query.view === "definition" ? "definition" : "data";
  const rawFilters = query.filter == null ? [] : [query.filter].flat();
  const search = (query.q ?? "").trim();

  const columns = entry
    ? ((await safe(() => describeTable(token, ref, schema, entry.name))) ?? [])
    : [];

  // Sort keys and filters naming a column that does not exist are dropped once, here, so the server
  // and the client controls cannot disagree about what is applied.
  const known = new Set(columns.map((c) => c.name));
  const sort = parseSort(query.sort).filter((s) => known.has(s.column));
  const filters = parseFilters(rawFilters).filter((f) => known.has(f.column));

  const [total, policies] = entry
    ? await Promise.all([
        safe(() =>
          rowCount(token, ref, schema, entry.name, {
            kind: entry.kind,
            estimate: entry.est_rows,
            columns,
            filters,
            search,
          }),
        ),
        safe(() => listPolicies(token, ref, schema, entry.name)).then((p) => p ?? []),
      ])
    : [null, []];

  // Land on the last real page rather than rendering "Page 900 of 3" over an empty grid. Only
  // possible where the count is known — a view has no last page to clamp to.
  const lastPage = total?.n == null ? null : Math.max(1, Math.ceil(total.n / size));
  const page = lastPage == null ? requestedPage : Math.min(requestedPage, lastPage);

  // Rows and DDL are alternatives, never both — there is no reason to pay for a full page of rows
  // while looking at the definition, or to synthesise DDL on every row page.
  const rows =
    view === "data" && entry && columns.length > 0
      ? await safe(() =>
          // Without columns there is nothing to order by, and an unordered LIMIT/OFFSET pages
          // non-deterministically — better to fetch nothing than to fetch wrong.
          selectRows(token, ref, schema, entry.name, {
            columns,
            sort,
            filters,
            search,
            limit: size,
            offset: (page - 1) * size,
          }),
        )
      : null;

  const built =
    view === "definition" && entry
      ? await safe(() => tableDefinition(token, ref, schema, entry.name))
      : null;
  const definition = built
    ? { ddl: built.ddl, html: await highlight(built.ddl, "sql"), complete: built.complete }
    : null;

  // Only an ordinary table with a primary key can have one of its rows addressed. A view and a
  // keyless table each fail for their own reason, which the toolbar states rather than merging.
  const editable =
    entry?.kind === "r" && columns.some((c) => c.pk_pos != null);

  const state = { schema, table: entry?.name ?? null, page, size, sort, filters, search, view };

  return (
    <TableUrlProvider current={queryString(state)}>
      <div className="flex h-screen">
        <TablesSidebar
          schemas={schemas}
          schema={schema}
          tables={tables}
          table={entry?.name ?? null}
          exposed={exposed}
          projectRef={ref}
          projectName={project.name}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TabBar projectRef={ref} schema={schema} table={entry?.name ?? null} />

          {!entry ? (
            <TableEmpty>
              {missing
                ? `No table or view named ${query.table} in schema ${schema}.`
                : `No tables or views in schema ${schema}.`}
            </TableEmpty>
          ) : (
            <TableWorkspace
              projectRef={ref}
              projectName={project.name}
              schema={schema}
              entry={entry}
              schemas={schemas}
              columns={columns}
              rows={rows}
              sort={sort}
              filters={filters}
              search={search}
              urlQuery={exportQuery(state)}
              policies={policies}
              total={total}
              page={page}
              size={size}
              view={view}
              definition={definition}
              editable={editable}
            />
          )}
        </div>
      </div>
    </TableUrlProvider>
  );
}
