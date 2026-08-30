import { serialiseFilter, type Filter } from "./table-filter";
import { serialiseSort, type SortKey } from "./table-view";

/**
 * The view's state as URL parameters.
 *
 * Built once, on the server, from the values the page already resolved — so the query string the
 * client writes through and the query the export runs cannot describe different things.
 */

export type TableView = {
  schema: string;
  table: string | null;
  page: number;
  size: number;
  sort: SortKey[];
  filters: Filter[];
  search: string;
  view: "data" | "definition";
};

/** Sort, filters and search alone — what an export needs to reproduce the current rows. */
export function exportQuery(v: Pick<TableView, "sort" | "filters" | "search">) {
  return {
    sort: v.sort.length > 0 ? serialiseSort(v.sort) : undefined,
    filter: v.filters.map(serialiseFilter),
    search: v.search || undefined,
  };
}

export function queryString(v: TableView): string {
  const qs = new URLSearchParams({
    schema: v.schema,
    page: String(v.page),
    size: String(v.size),
  });
  if (v.table) qs.set("table", v.table);
  if (v.sort.length > 0) qs.set("sort", serialiseSort(v.sort));
  if (v.search !== "") qs.set("q", v.search);
  if (v.view === "definition") qs.set("view", v.view);
  for (const f of v.filters) qs.append("filter", serialiseFilter(f));
  return qs.toString();
}
