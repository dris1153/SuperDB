import "server-only";
import { cache } from "react";
import { connectionsWithTokens, type Connection, type ConnectionKind } from "./connections";
import { getProject, listOrgs, listProjects, type Project } from "./mgmt-api";
import { projectOrder } from "./project-order";

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

  // A project the user has placed by hand wins. Anything unplaced sorts after everything placed —
  // MAX_SAFE_INTEGER rather than 0, because a project created upstream since the last reorder
  // appearing at the top of the board is the most visible possible wrong answer. sort() is stable,
  // so those keep the connection grouping above among themselves; no further tiebreak is needed.
  const placed = (p: InventoryProject) => order.get(p.ref) ?? Number.MAX_SAFE_INTEGER;
  const projects = grouped.sort((a, b) => placed(a) - placed(b));

  return { projects, connections: connections.map(({ token, ...c }) => c), errors };
}

/** Project refs are 20 lowercase letters — validate before it reaches a URL we build. */
export const isProjectRef = (ref: string) => /^[a-z]{20}$/.test(ref);

/**
 * Finds which connection owns a ref by asking all of them at once.
 * Returns the token so the caller can make follow-up calls without a second lookup.
 *
 * Wrapped in cache() because the project layout and the page inside it both need this, and each call
 * fans out one request per connection — without deduplication every navigation would double them.
 */
export const resolveProject = cache(async (ref: string) => {
  if (!isProjectRef(ref)) return null;
  const connections = await connectionsWithTokens();

  const hits = await Promise.all(
    connections.map(async ({ token, ...connection }) => {
      if (!token) return null;
      try {
        return { token, connection, project: await getProject(token, ref) };
      } catch {
        return null;
      }
    }),
  );
  return hits.find((h) => h !== null) ?? null;
});
