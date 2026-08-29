import { notFound } from "next/navigation";
import { resolveProject } from "@/lib/inventory";
import { getExposedSchemas } from "@/lib/mgmt-api";
import { describeTable, listPolicies, listSchemas, listTablesIn } from "@/lib/table-editor";
import { rowCount, selectRows } from "@/lib/table-rows";
import { tableDefinition } from "@/lib/table-ddl";
import { highlight } from "@/lib/highlight";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  parseFilters,
  parseSort,
  serialiseFilter,
  serialiseSort,
} from "@/lib/table-view";
import { clampInt } from "@/lib/sql-ident";
import { safe } from "@/lib/safe";
import { Empty } from "@/components/ui/empty-state";
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
  const { token } = found;

  const schemas = (await safe(() => listSchemas(token, ref))) ?? [];
  if (schemas.length === 0) {
    return (
      <div className="p-6">
        <Empty>
          Could not read this database. Paused projects and restricted tokens return nothing here.
        </Empty>
      </div>
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
  const entry = tables.find((t) => t.name === query.table) ?? tables[0] ?? null;

  // Null rather than false when the setting is unreadable: an icon that guesses is worse than none.
  const exposed = postgrest ? postgrest.includes(schema) : null;

  const size = PAGE_SIZES.includes(Number(query.size) as (typeof PAGE_SIZES)[number])
    ? Number(query.size)
    : DEFAULT_PAGE_SIZE;
  const requestedPage = clampInt(query.page, 1, Number.MAX_SAFE_INTEGER, 1);
  const view = query.view === "definition" ? "definition" : "data";
  const rawFilters = query.filter == null ? [] : [query.filter].flat();

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
          rowCount(token, ref, schema, entry.name, entry.kind, entry.est_rows, columns, filters),
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
            limit: size,
            offset: (page - 1) * size,
          }),
        )
      : null;

  const built = view === "definition" && entry
    ? await safe(() => tableDefinition(token, ref, schema, entry.name))
    : null;
  const definition = built
    ? { ddl: built.ddl, html: await highlight(built.ddl, "sql"), complete: built.complete }
    : null;

  const search = new URLSearchParams({ schema, page: String(page), size: String(size) });
  if (entry) search.set("table", entry.name);
  if (sort.length > 0) search.set("sort", serialiseSort(sort));
  if (view === "definition") search.set("view", view);
  for (const f of filters) search.append("filter", serialiseFilter(f));

  return (
    <TableUrlProvider current={search.toString()}>
      <div className="flex h-screen">
        <TablesSidebar
          schemas={schemas}
          schema={schema}
          tables={tables}
          table={entry?.name ?? null}
          exposed={exposed}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <TabBar projectRef={ref} schema={schema} table={entry?.name ?? null} />

          {!entry ? (
            <div className="p-6">
              <Empty>No tables or views in schema {schema}.</Empty>
            </div>
          ) : (
            <TableWorkspace
              projectRef={ref}
              schema={schema}
              entry={entry}
              columns={columns}
              rows={rows}
              sort={sort}
              filters={filters}
              policies={policies}
              total={total}
              page={page}
              size={size}
              view={view}
              definition={definition}
            />
          )}
        </div>
      </div>
    </TableUrlProvider>
  );
}
