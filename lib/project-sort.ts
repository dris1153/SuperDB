import type { Project } from "./mgmt-api";
import { isProjectRef } from "./project-ref.ts";

/**
 * Sorting for the board's project cards.
 *
 * Like project-status.ts, this cannot live in mgmt-api: that module is server-only and the board is
 * a client component. The type import above is erased, so nothing server-side comes with it.
 *
 * Sorting is a view preference only. Projects come from the Management API on every load, so there
 * is nowhere to persist a manual order without a table keyed on a project ref this app does not own
 * — see 260911-0039-project-card-sorting-brainstorm.md.
 */

export type ProjectSort = "manual" | "name" | "status" | "region" | "newest";

/**
 * "My order" is the default and names what the server sends: the user's dragged order where one
 * exists, connection order underneath it. Without an option for it there would be no way back after
 * sorting, and it is also the only mode in which dragging is allowed.
 */
export const PROJECT_SORTS: { value: ProjectSort; label: string }[] = [
  { value: "manual", label: "My order" },
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
  { value: "region", label: "Region" },
  { value: "newest", label: "Newest first" },
];

const OTHER = 90;

/**
 * Sorting by status is what you do to find what needs attention, so it ranks by how much attention
 * something wants — alphabetically, ACTIVE_HEALTHY would sort above ACTIVE_UNHEALTHY, which is the
 * opposite of useful. A judgement call, not a fact; change the numbers, not the callers.
 */
const SEVERITY: Record<Project["status"], number> = {
  // Broken, and only a person can fix it.
  ACTIVE_UNHEALTHY: 10,
  INIT_FAILED: 11,
  RESTORE_FAILED: 12,
  PAUSE_FAILED: 13,

  // On its way somewhere; the only action is to wait.
  COMING_UP: 20,
  GOING_DOWN: 21,
  PAUSING: 22,
  RESTORING: 23,
  RESTARTING: 24,
  UPGRADING: 25,
  RESIZING: 26,

  INACTIVE: 30,
  ACTIVE_HEALTHY: 40,

  REMOVED: OTHER,
  UNKNOWN: OTHER,
};

/** Cast because Supabase can return a status this union has not learned about yet. */
const severity = (status: string) => SEVERITY[status as Project["status"]] ?? OTHER;

type Sortable = Pick<Project, "name" | "status" | "region" | "created_at">;

/**
 * Returns the input untouched for "manual": the server already sent it in that order, and copying would only
 * invite a caller to assume otherwise.
 *
 * No tiebreak is needed. Array.prototype.sort is stable and the input arrives in connection order,
 * so projects with equal keys keep it.
 */
export function sortProjects<T extends Sortable>(rows: T[], sort: ProjectSort): T[] {
  if (sort === "manual") return rows;

  return [...rows].sort((a, b) => {
    switch (sort) {
      case "name":
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      case "status":
        return severity(a.status) - severity(b.status);
      case "region":
        // The raw code, because that is what the card prints — sorting on a prettier label would
        // produce an order that cannot be read off the screen.
        return a.region.localeCompare(b.region, undefined, { sensitivity: "base" });
      case "newest":
        return b.created_at.localeCompare(a.created_at);
    }
  });
}

/**
 * Orders projects by a saved position, leaving anything unplaced after everything placed.
 *
 * MAX_SAFE_INTEGER rather than 0: a project created upstream since the last reorder appearing at the
 * top of the board is the most visible possible wrong answer. Positions are 1-based, so they never
 * reach the sentinel and the difference stays exactly representable.
 *
 * Returns a comparator rather than sorting, so the caller keeps its own stable sort — unplaced
 * projects then hold whatever order they arrived in, which is the connection grouping.
 */
export function bySavedOrder<T extends { ref: string }>(order: Map<string, number>) {
  const placed = (p: T) => order.get(p.ref) ?? Number.MAX_SAFE_INTEGER;
  return (a: T, b: T) => placed(a) - placed(b);
}

/**
 * Whether an array is safe to send as a project order. Separate from the action that throws on it, so
 * the rule can be tested without a database — the action itself cannot be imported by node:test,
 * because its Supabase imports resolve only through the bundler.
 */
export function isValidProjectOrder(refs: unknown, max: number): refs is string[] {
  return (
    Array.isArray(refs) &&
    refs.length <= max &&
    refs.every((ref) => typeof ref === "string" && isProjectRef(ref))
  );
}
