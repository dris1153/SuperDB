import "server-only";
import { cache } from "react";
import { connectionsWithTokens, type Connection, type ConnectionKind } from "./connections";
import { getProject, listOrgs, listProjects, type Project } from "./mgmt-api";
import { projectOrder } from "./project-order";
import { isProjectRef } from "./project-ref";
import { requireUser } from "./supabase/server";
import { bySavedOrder } from "./project-sort";

export type InventoryProject = Project & {
  connectionId: string;
  kind: ConnectionKind;
  /** The name the user gave this connection, not the organization name. */
  owner: string;
  tags: string[];
  orgName: string;
};

export type Inventory = {
  projects: InventoryProject[];
  connections: Connection[];
  errors: { owner: string; message: string }[];
  /** Whether the user has dragged anything yet. The board cannot tell from the order alone. */
  ordered: boolean;
};

/** Fans out across every connection. One broken token degrades its own row, not the page. */
export async function loadInventory(): Promise<Inventory> {
  // Alongside the tokens rather than after them: the order is a small keyed read against this app's
  // own database, so pairing it here costs no wall-clock time.
  const [connections, order] = await Promise.all([connectionsWithTokens(), projectOrder()]);
  const errors: Inventory["errors"] = [];

  const perConnection = await Promise.all(
    connections.map(async ({ token, ...connection }) => {
      const owner = connection.display_name;
      if (!token) {
        errors.push({ owner, message: connection.last_error ?? "Reconnect required" });
        return [];
      }
      try {
        const [projects, orgs] = await Promise.all([listProjects(token), listOrgs(token)]);
        const orgName = new Map(orgs.map((o) => [o.slug, o.name]));
        return projects.map<InventoryProject>((p) => ({
          ...p,
          connectionId: connection.id,
          kind: connection.kind,
          owner,
          tags: connection.tags,
          orgName: orgName.get(p.organization_slug) ?? p.organization_slug,
        }));
      } catch (e) {
        errors.push({ owner, message: e instanceof Error ? e.message : String(e) });
        return [];
      }
    }),
  );

  // Sorted within a connection only, never across them: connectionsWithTokens returns the user's
  // chosen sort_order and perConnection preserves it, so the board follows the order set on the
  // connections page. Sorting by owner here again would silently override it — this is deliberate,
  // not a missing sort.
  const grouped = perConnection.flatMap((group) =>
    group.sort((a, b) => a.orgName.localeCompare(b.orgName) || a.name.localeCompare(b.name)),
  );

  // A project the user has placed by hand wins; see bySavedOrder for why unplaced ones go last.
  // sort() is stable, so those keep the connection grouping above among themselves.
  const projects = grouped.sort(bySavedOrder(order));

  return {
    projects,
    connections: connections.map(({ token, ...c }) => c),
    errors,
    ordered: order.size > 0,
  };
}

/** Re-exported so existing callers keep working; the definition lives in a leaf to avoid a cycle. */
export { isProjectRef };

/**
 * Finds which connection owns a ref by asking all of them at once.
 * Returns the token so the caller can make follow-up calls without a second lookup.
 *
 * Wrapped in cache() because the project layout and the page inside it both need this, and each call
 * fans out one request per connection — without deduplication every navigation would double them.
 */
/**
 * Which connection last answered for a ref, per user, for a minute.
 *
 * `cache()` below deduplicates within one request, which was enough while a page resolved the
 * project once. The read endpoints turned that into one resolve *per part*, and each resolve asks
 * every connection — three connections and ten cards is thirty upstream calls spent on authorisation
 * alone, against an API that throttles.
 *
 * The project body is remembered with it, because otherwise every part still pays one `getProject`
 * to prove what the previous part just proved — nine parts, nine calls, before any of them read
 * anything. Never a token: the token comes from the caller's own RLS-scoped query each time, so a
 * remembered entry cannot grant access to a connection the caller no longer has.
 *
 * A minute of staleness costs a project name or status that is a minute old on a page that is about
 * to fetch both again anyway. A stale entry whose connection is gone falls back to the fan-out.
 */
const OWNER_TTL_MS = 60_000;
const owners = new Map<string, { connectionId: string; project: Project; at: number }>();

export const resolveProject = cache(async (ref: string) => {
  if (!isProjectRef(ref)) return null;
  const connections = await connectionsWithTokens();

  const { user } = await requireUser();
  const key = `${user.id}:${ref}`;
  const remembered = owners.get(key);

  const ask = async (entry: (typeof connections)[number]) => {
    const { token, ...connection } = entry;
    if (!token) return null;
    try {
      return { token, connection, project: await getProject(token, ref) };
    } catch {
      return null;
    }
  };

  if (remembered && Date.now() - remembered.at < OWNER_TTL_MS) {
    const known = connections.find((c) => c.id === remembered.connectionId);
    if (known?.token) {
      const { token, ...connection } = known;
      return { token, connection, project: remembered.project };
    }
    owners.delete(key);
  }

  const hits = await Promise.all(connections.map(ask));
  const hit = hits.find((h) => h !== null) ?? null;
  if (hit) {
    owners.set(key, { connectionId: hit.connection.id, project: hit.project, at: Date.now() });
  }
  return hit;
});
