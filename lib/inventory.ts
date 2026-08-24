import "server-only";
import { accountsWithTokens, type Account } from "./accounts";
import { getProject, listOrgs, listProjects, type Project } from "./mgmt-api";

export type InventoryProject = Project & {
  accountId: string;
  accountEmail: string;
  accountLabel: string | null;
  orgName: string;
};

export type Inventory = {
  projects: InventoryProject[];
  accounts: Account[];
  errors: { email: string; message: string }[];
};

/** Fans out across every stored account. One broken token degrades its own row, not the page. */
export async function loadInventory(): Promise<Inventory> {
  const accounts = await accountsWithTokens();
  const errors: Inventory["errors"] = [];

  const perAccount = await Promise.all(
    accounts.map(async ({ token, ...account }) => {
      try {
        const [projects, orgs] = await Promise.all([listProjects(token), listOrgs(token)]);
        const orgName = new Map(orgs.map((o) => [o.slug, o.name]));
        return projects.map<InventoryProject>((p) => ({
          ...p,
          accountId: account.id,
          accountEmail: account.email,
          accountLabel: account.label,
          orgName: orgName.get(p.organization_slug) ?? p.organization_slug,
        }));
      } catch (e) {
        errors.push({ email: account.email, message: e instanceof Error ? e.message : String(e) });
        return [];
      }
    }),
  );

  const projects = perAccount.flat().sort((a, b) => {
    return a.accountEmail.localeCompare(b.accountEmail) || a.orgName.localeCompare(b.orgName) || a.name.localeCompare(b.name);
  });

  return { projects, accounts: accounts.map(({ token, ...a }) => a), errors };
}

/** Project refs are 20 lowercase letters — validate before it reaches a URL we build. */
export const isProjectRef = (ref: string) => /^[a-z]{20}$/.test(ref);

/**
 * Finds which connected account owns a ref by asking all of them at once.
 * Returns the token so the caller can make follow-up calls without a second lookup.
 */
export async function resolveProject(ref: string) {
  if (!isProjectRef(ref)) return null;
  const accounts = await accountsWithTokens();
  const hits = await Promise.all(
    accounts.map(async ({ token, ...account }) => {
      try {
        return { token, account, project: await getProject(token, ref) };
      } catch {
        return null;
      }
    }),
  );
  return hits.find((h) => h !== null) ?? null;
}
