/**
 * Column sorting for the connections table.
 *
 * Kept as pure functions so the ordering is testable without a database — the two modules this sits
 * beside, connections.ts and inventory.ts, have no tests precisely because everything in them does
 * I/O.
 *
 * Sorting is a *temporary override* of the user's manual order, never a replacement: the cycle runs
 * ascending, descending, then back to no sort at all, which is what returns the table to the order
 * the user arranged. Without that third state there would be no way back without editing the URL.
 */

export type SortColumn = "owner" | "kind" | "account" | "added";
export type SortDirection = "asc" | "desc";
export type ConnectionSort = { column: SortColumn; dir: SortDirection };

/** What each column compares on. `added` holds an ISO timestamp, which sorts correctly as text. */
export type SortKeys = Record<SortColumn, string>;

const COLUMNS: SortColumn[] = ["owner", "kind", "account", "added"];

/** Wire format `column.dir`, matching the table editor's existing `sort=id.asc`. */
export function parseConnectionSort(value: string | undefined | null): ConnectionSort | null {
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator < 1) return null;

  const column = value.slice(0, separator);
  const dir = value.slice(separator + 1);
  if (!COLUMNS.includes(column as SortColumn)) return null;
  if (dir !== "asc" && dir !== "desc") return null;

  return { column: column as SortColumn, dir };
}

export const serialiseConnectionSort = (sort: ConnectionSort) => `${sort.column}.${sort.dir}`;

/**
 * Clicking a header: unsorted to ascending, ascending to descending, descending back to the manual
 * order. Clicking a different column always starts that column ascending.
 */
export function nextConnectionSort(
  current: ConnectionSort | null,
  column: SortColumn,
): ConnectionSort | null {
  if (current?.column !== column) return { column, dir: "asc" };
  return current.dir === "asc" ? { column, dir: "desc" } : null;
}

/**
 * Null sort means the rows are already in the user's order and must be left exactly as they are.
 * Copies rather than sorting in place, because the caller's array is the manual order.
 */
export function sortConnections<T>(
  rows: T[],
  sort: ConnectionSort | null,
  keys: (row: T) => SortKeys,
): T[] {
  if (!sort) return rows;
  const direction = sort.dir === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
    const left = keys(a)[sort.column];
    const right = keys(b)[sort.column];
    // Empty stays last in either direction, for every column: a missing value is absent, not
    // "before A". Only the account column produces one today.
    if (left === "" || right === "") return left === right ? 0 : left === "" ? 1 : -1;
    // Locale pinned so the order does not depend on the server's own locale.
    return left.localeCompare(right, undefined, { sensitivity: "base" }) * direction;
  });
}

/**
 * The account column's sort key.
 *
 * Email first, method second — the reverse mixes two vocabularies in one column, so an address would
 * sort between "Email + password" and "GitHub" and the resulting order could not be read off the
 * screen. Sorting on the email puts every identified account in one alphabet, with method only
 * breaking ties among rows that have no address.
 */
export const accountSortKey = (
  methodLabel: string | null | undefined,
  email: string | null | undefined,
) => email?.trim() || methodLabel || "";
