import "server-only";
import { connectionsWithTokens, ownerLabel, type Connection, type ConnectionKind } from "./connections";
import { getProject, listOrgs, listProjects, type Project } from "./mgmt-api";

export type InventoryProject = Project & {
  connectionId: string;
  kind: ConnectionKind;
  /** Account email for token connections, organization name for OAuth ones. */
  owner: string;
  label: string | null;
  orgName: string;
};

export type Inventory = {
  projects: InventoryProject[];
  connections: Connection[];
  errors: { owner: string; message: string }[];
};

/** Fans out across every connection. One broken token degrades its own row, not the page. */
export async function loadInventory(): Promise<Inventory> {
  const connections = await connectionsWithTokens();
  const errors: Inventory["errors"] = [];

  const perConnection = await Promise.all(
    connections.map(async ({ token, ...connection }) => {
      const owner = ownerLabel(connection);
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
          label: connection.label,
          orgName: orgName.get(p.organization_slug) ?? p.organization_slug,
        }));
      } catch (e) {
        errors.push({ owner, message: e instanceof Error ? e.message : String(e) });
        return [];
      }
    }),
  );

  const projects = perConnection
    .flat()
    .sort(
      (a, b) =>
        a.owner.localeCompare(b.owner) || a.orgName.localeCompare(b.orgName) || a.name.localeCompare(b.name),
    );

  return { projects, connections: connections.map(({ token, ...c }) => c), errors };
}

/** Project refs are 20 lowercase letters — validate before it reaches a URL we build. */
export const isProjectRef = (ref: string) => /^[a-z]{20}$/.test(ref);

/**
 * Finds which connection owns a ref by asking all of them at once.
 * Returns the token so the caller can make follow-up calls without a second lookup.
 */
export async function resolveProject(ref: string) {
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
}
