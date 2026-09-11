import { Suspense } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  IconAlertTriangle,
  IconChevronDown,
  IconChevronUp,
  IconPlugConnected,
} from "@tabler/icons-react";
import {
  addPatConnection,
  listConnections,
  listTags,
  modeEnabled,
  removeConnection,
  reorderConnections,
  updateConnection,
} from "@/lib/connections";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listConnectionSecrets } from "@/lib/vault-actions";
import { ConnectTokenForm } from "@/components/connect-token-form";
import { DisconnectConnection } from "@/components/disconnect-connection";
import { EditConnection } from "@/components/edit-connection";
import { ToastFromParams } from "@/components/toast-from-params";
import { date } from "@/lib/format";
import { methodLabel } from "@/lib/credential-methods";
import type { ConnectionSecret } from "@/lib/vault-actions";
import {
  accountSortKey,
  nextConnectionSort,
  parseConnectionSort,
  serialiseConnectionSort,
  sortConnections,
  type ConnectionSort,
  type SortColumn,
} from "@/lib/connection-sort";
import { SortableConnections, type ConnectionRow } from "@/components/sortable-connections";

export const dynamic = "force-dynamic";

const HEAD = "text-xs font-normal text-subtle";

/** Header text, so the "sorted by" line names the column the way the header does. */
const SORT_LABELS: Record<SortColumn, string> = {
  owner: "Owner",
  kind: "Kind",
  account: "Account",
  added: "Added",
};

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const [connections, availableTags, secrets, query] = await Promise.all([
    listConnections(),
    listTags(),
    listConnectionSecrets(),
    searchParams,
  ]);
  const secretByConnection = new Map(secrets.map((s) => [s.connection_id, s]));
  const oauth = modeEnabled("oauth");
  const pat = modeEnabled("pat");

  // listConnections already returns the user's manual order; a sort here temporarily overrides it.
  const sort = parseConnectionSort(query.sort);
  const ordered = sortConnections(connections, sort, (c) => {
    const secret = secretByConnection.get(c.id);
    return {
      owner: c.display_name,
      kind: c.kind,
      account: accountSortKey(methodLabel(secret?.supabase_login_method), secret?.supabase_email),
      added: c.created_at,
    };
  });

  async function connectToken(token: string, tags: string[]) {
    "use server";
    let org;
    try {
      org = await addPatConnection(token, tags);
    } catch (e) {
      redirect(
        `/connections?error=${encodeURIComponent(e instanceof Error ? e.message : "Failed to connect")}`,
      );
    }
    revalidatePath("/");
    redirect(`/connections?connected=${encodeURIComponent(org.name)}`);
  }

  async function saveConnection(id: string, displayName: string, tags: string[]) {
    "use server";
    await updateConnection(id, { display_name: displayName, tags });
    revalidatePath("/");
    revalidatePath("/connections");
  }

  async function disconnect(id: string, owner: string) {
    "use server";
    await removeConnection(id);
    revalidatePath("/");
    redirect(`/connections?disconnected=${encodeURIComponent(owner)}`);
  }

  async function reorder(ids: string[]) {
    "use server";
    await reorderConnections(ids);
    // Both, because both render the order — "/" through loadInventory. Revalidating only this page
    // would leave the board stale, which is the bug shape saveConnectionSecret already had.
    revalidatePath("/");
    revalidatePath("/connections");
  }

  // Cells stay server-rendered — EditConnection and DisconnectConnection keep receiving their server
  // actions as props. The client component only wraps each set in a row it can move.
  const rows: ConnectionRow[] = ordered.map((c) => ({
    id: c.id,
    label: c.display_name,
    cells: (
      <>
        <TableCell className="text-foreground">
          {c.display_name}
          {c.last_error ? (
            <div className="mt-1 flex items-center gap-1 text-xs text-warn">
              <IconAlertTriangle size={13} stroke={1.5} />
              Reconnect required
            </div>
          ) : null}
        </TableCell>
        <TableCell>
          <Badge
            variant="outline"
            className={
              c.kind === "oauth" ? "rounded-full border-brand-border text-primary" : "rounded-full"
            }
          >
            {c.kind}
          </Badge>
        </TableCell>
        <TableCell>
          <CredentialCell secret={secretByConnection.get(c.id) ?? null} />
        </TableCell>
        <TableCell>
          {c.tags.length === 0 ? (
            <span className="text-subtle">—</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {c.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="rounded-full">
                  {tag}
                </Badge>
              ))}
            </span>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs text-subtle">…{c.token_hint}</TableCell>
        <TableCell className="text-subtle">{date(c.created_at)}</TableCell>
        <TableCell>
          <div className="flex justify-end gap-1">
            <EditConnection
              id={c.id}
              displayName={c.display_name}
              tags={c.tags}
              availableTags={availableTags}
              secret={secretByConnection.get(c.id) ?? null}
              action={saveConnection}
            />
            <DisconnectConnection
              id={c.id}
              owner={c.display_name}
              kind={c.kind}
              action={disconnect}
            />
          </div>
        </TableCell>
      </>
    ),
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Outcomes arrive as query params from the server actions above and become toasts. */}
      <Suspense fallback={null}>
        <ToastFromParams />
      </Suspense>

      <header>
        <h1 className="text-xl">Connections</h1>
        <p className="text-sm text-subtle">
          Link the Supabase organizations and accounts whose projects you want
          to see here.
        </p>
      </header>

      {/* Neither route dominates, so neither is hidden. Both are limited to one organization by
          Supabase, and neither can see an account email. */}

      <div className="grid gap-3 md:grid-cols-2">
        {oauth ? (
          <Card className="flex flex-col p-4">
            <h2 className="text-sm text-foreground">Connect with Supabase</h2>
            <p className="mt-1 flex-1 text-sm text-subtle">
              One click, nothing to paste. The grant renews itself and you can
              revoke it from your own Supabase settings at any time. Disk usage
              and API keys stay hidden — Supabase does not expose those over
              OAuth.
            </p>
            <Button asChild className="mt-3 self-start">
              <Link href="/api/connect/start">
                <IconPlugConnected size={16} stroke={1.5} />
                Connect with Supabase
              </Link>
            </Button>
          </Card>
        ) : null}

        {pat ? (
          <Card className="flex flex-col p-4">
            <h2 className="text-sm text-foreground">
              Connect with an access token
            </h2>
            <p className="mt-1 text-sm text-subtle">
              Shows everything, disk usage and API keys included. Create one at{" "}
              <span className="font-mono text-muted-foreground">
                supabase.com/dashboard/account/tokens
              </span>{" "}
              and grant only the capabilities you want. It does not renew, so it
              stops working when it expires.
            </p>
            <ConnectTokenForm availableTags={availableTags} action={connectToken} />
          </Card>
        ) : null}
      </div>

      {connections.length === 0 ? (
        <Empty>Nothing connected yet.</Empty>
      ) : (
        <div className="space-y-2">
          {sort ? (
            <p className="text-xs text-subtle">
              Sorted by {SORT_LABELS[sort.column]}. Dragging is off while a sort is applied —{" "}
              <Link href="/connections" className="text-brand-text hover:underline">
                clear it to reorder
              </Link>
              .
            </p>
          ) : null}

          <div className="rounded-lg border border-border overflow-hidden">
            <Table className="min-w-2xl">
              <TableHeader className="bg-card">
                <TableRow className="hover:bg-transparent">
                  <TableHead className={HEAD} />
                    <SortHead column="owner" label="Owner" sort={sort} />
                  <SortHead column="kind" label="Kind" sort={sort} />
                  <SortHead column="account" label="Account" sort={sort} />
                  <TableHead className={HEAD}>Tags</TableHead>
                  <TableHead className={HEAD}>Token</TableHead>
                  <SortHead column="added" label="Added" sort={sort} />
                  <TableHead className={HEAD} />
                </TableRow>
              </TableHeader>
              <TableBody>
                <SortableConnections rows={rows} sorted={sort !== null} reorder={reorder} />
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

/** Cycles this column on click; the third click drops the sort and restores the manual order. */
function SortHead({
  column,
  label,
  sort,
}: {
  column: SortColumn;
  label: string;
  sort: ConnectionSort | null;
}) {
  const next = nextConnectionSort(sort, column);
  const href = next ? `/connections?sort=${serialiseConnectionSort(next)}` : "/connections";
  const direction = sort?.column === column ? sort.dir : null;

  return (
    <TableHead
      className={HEAD}
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
    >
      <Link href={href} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {direction === "asc" ? <IconChevronUp size={13} stroke={1.5} aria-label="ascending" /> : null}
        {direction === "desc" ? (
          <IconChevronDown size={13} stroke={1.5} aria-label="descending" />
        ) : null}
      </Link>
    </TableHead>
  );
}

/**
 * Method and email are plaintext in the database, so this renders without the vault being unlocked —
 * which is the point: it answers "whose account is this" from the table, without opening a dialog.
 */
function CredentialCell({ secret }: { secret: ConnectionSecret | null }) {
  const label = methodLabel(secret?.supabase_login_method);
  if (!label && !secret?.supabase_email) return <span className="text-subtle">—</span>;

  return (
    <div className="flex flex-col items-start gap-1">
      {label ? (
        <Badge variant="outline" className="rounded-full">
          {label}
        </Badge>
      ) : null}
      {secret?.supabase_email ? (
        <span className="text-xs text-subtle">{secret.supabase_email}</span>
      ) : null}
    </div>
  );
}
