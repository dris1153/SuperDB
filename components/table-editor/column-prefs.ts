"use client";

/**
 * How one person is looking at one table: which columns are hidden and which are pinned left.
 *
 * Per browser, not in the URL. Column layout means nothing to whoever a link is shared with, and six
 * column widths in a query string makes every URL unreadable. Filters and sort stay in the URL
 * because they change *what data* is shown; this does not.
 *
 * Every access is guarded: private browsing and blocked site data throw on `sessionStorage`, the same
 * hazard `lib/vault-store.ts` documents.
 */

export type ColumnPrefs = {
  hidden: string[];
  frozen: string[];
  /** Column names in display order. Names not listed keep their catalog order, after these. */
  order: string[];
  /**
   * Only widths the user dragged. react-data-grid also reports `measured` widths it worked out
   * itself; persisting those would freeze auto-sizing at whatever the first render happened to fit.
   */
  widths: [string, number][];
};

const EMPTY: ColumnPrefs = { hidden: [], frozen: [], order: [], widths: [] };

// The pair is JSON-encoded rather than joined with a separator: schema `a.b` table `c` and schema
// `a` table `b.c` are both legal Postgres identifiers and would collide on any single character.
const key = (ref: string, schema: string, table: string) =>
  `superdb:cols:${ref}:${JSON.stringify([schema, table])}`;

const asNames = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const asWidths = (value: unknown): [string, number][] =>
  Array.isArray(value)
    ? value.filter(
        (v): v is [string, number] =>
          Array.isArray(v) &&
          v.length === 2 &&
          typeof v[0] === "string" &&
          typeof v[1] === "number" &&
          Number.isFinite(v[1]),
      )
    : [];

export function readPrefs(ref: string, schema: string, table: string): ColumnPrefs {
  try {
    const raw = sessionStorage.getItem(key(ref, schema, table));
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY;
    const p = parsed as Partial<Record<keyof ColumnPrefs, unknown>>;
    return {
      hidden: asNames(p.hidden),
      frozen: asNames(p.frozen),
      order: asNames(p.order),
      widths: asWidths(p.widths),
    };
  } catch {
    return EMPTY;
  }
}

export const EMPTY_PREFS = EMPTY;

/**
 * Row density, stored once rather than per table.
 *
 * The plan filed this with the column preferences, which are per table — but density describes how
 * one person likes to read a grid, not anything about a particular table, and per-table storage would
 * mean setting it again for every table opened.
 */
export type Density = "compact" | "normal";
const DENSITY_KEY = "superdb:density";
export const ROW_HEIGHT: Record<Density, number> = { compact: 28, normal: 36 };

export function readDensity(): Density {
  try {
    return sessionStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "normal";
  } catch {
    return "normal";
  }
}

export function writeDensity(value: Density) {
  try {
    sessionStorage.setItem(DENSITY_KEY, value);
  } catch {
    // Session-only is fine; this is a view preference, not data.
  }
}

/** Sidebar width, stored once for the same reason as density: it is about the person, not the table. */
const COLLAPSED_KEY = "superdb:sidebar-collapsed";

export function readCollapsed(): boolean {
  try {
    return sessionStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeCollapsed(value: boolean) {
  try {
    sessionStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // As above.
  }
}

export function writePrefs(ref: string, schema: string, table: string, prefs: ColumnPrefs) {
  try {
    sessionStorage.setItem(key(ref, schema, table), JSON.stringify(prefs));
  } catch {
    // Session-only is an acceptable degradation; losing a column layout is not worth an error.
  }
}

/**
 * Stored names are filtered against the live column list on every read, so a dropped or renamed
 * column leaves a stale entry that is ignored rather than a layout that breaks.
 */
export const usable = (stored: string[], live: Set<string>) => stored.filter((n) => live.has(n));
