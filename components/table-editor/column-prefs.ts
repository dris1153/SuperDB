"use client";

import { useCallback } from "react";
import { useSession, writeSession } from "./session-store";

/**
 * How one person is looking at one table: which columns are hidden, pinned, in what order and how
 * wide — plus the two whole-editor preferences, density and sidebar width.
 *
 * Per browser, not in the URL. Column layout means nothing to whoever a link is shared with, and six
 * column widths in a query string makes every URL unreadable. Filters and sort stay in the URL
 * because they change *what data* is shown; this does not.
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

export const EMPTY_PREFS: ColumnPrefs = { hidden: [], frozen: [], order: [], widths: [] };

// The pair is JSON-encoded rather than joined with a separator: schema `a.b` table `c` and schema
// `a` table `b.c` are both legal Postgres identifiers and would collide on any single character.
const columnsKey = (ref: string, schema: string, table: string) =>
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

function parsePrefs(raw: string): ColumnPrefs {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) return EMPTY_PREFS;
  const p = parsed as Partial<Record<keyof ColumnPrefs, unknown>>;
  return {
    hidden: asNames(p.hidden),
    frozen: asNames(p.frozen),
    order: asNames(p.order),
    widths: asWidths(p.widths),
  };
}

export function useColumnPrefs(ref: string, schema: string, table: string) {
  const key = columnsKey(ref, schema, table);
  const prefs = useSession(key, EMPTY_PREFS, parsePrefs);
  const save = useCallback(
    (next: ColumnPrefs) => writeSession(key, JSON.stringify(next)),
    [key],
  );
  return [prefs, save] as const;
}

/**
 * Stored names are filtered against the live column list on read *and* on write, so a dropped or
 * renamed column leaves a stale entry that is ignored rather than a layout that breaks.
 */
export const usable = (stored: string[], live: Set<string>) => stored.filter((n) => live.has(n));

/**
 * Density and sidebar width are stored once rather than per table: they describe how a person likes
 * to read a grid, not anything about a particular table.
 */
export type Density = "compact" | "normal";
export const ROW_HEIGHT: Record<Density, number> = { compact: 28, normal: 36 };

const DENSITY_KEY = "superdb:density";
const DENSITY_FALLBACK: Density = "normal";
const parseDensity = (raw: string): Density => (raw === "compact" ? "compact" : "normal");

export function useDensity() {
  const density = useSession(DENSITY_KEY, DENSITY_FALLBACK, parseDensity);
  const setDensity = useCallback((next: Density) => writeSession(DENSITY_KEY, next), []);
  return { density, setDensity };
}

const COLLAPSED_KEY = "superdb:sidebar-collapsed";
const COLLAPSED_FALLBACK = false;
const parseCollapsed = (raw: string) => raw === "1";

export function useSidebarCollapsed() {
  const collapsed = useSession(COLLAPSED_KEY, COLLAPSED_FALLBACK, parseCollapsed);
  const setCollapsed = useCallback(
    (next: boolean) => writeSession(COLLAPSED_KEY, next ? "1" : "0"),
    [],
  );
  return [collapsed, setCollapsed] as const;
}
