import { Suspense } from "react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { IconAlertTriangle, IconPlugConnected } from "@tabler/icons-react";
import {
  addPatConnection,
  listConnections,
  listTags,
  modeEnabled,
  removeConnection,
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

export const dynamic = "force-dynamic";

const HEAD = "text-xs font-normal text-subtle";

export default async function ConnectionsPage() {
  const [connections, availableTags, secrets] = await Promise.all([
    listConnections(),
    listTags(),
    listConnectionSecrets(),
  ]);
  const secretByConnection = new Map(secrets.map((s) => [s.connection_id, s]));
  const oauth = modeEnabled("oauth");
  const pat = modeEnabled("pat");

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
        <div className="rounded-lg border border-border overflow-hidden">
          <Table className="min-w-2xl">
            <TableHeader className="bg-card">
              <TableRow className="hover:bg-transparent">
                {["Owner", "Kind", "Tags", "Token", "Added", ""].map((h) => (
                  <TableHead key={h} className={HEAD}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((c) => (
                <TableRow key={c.id}>
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
                        c.kind === "oauth"
                          ? "rounded-full border-brand-border text-primary"
                          : "rounded-full"
                      }
                    >
                      {c.kind}
                    </Badge>
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
                  <TableCell className="font-mono text-xs text-subtle">
                    …{c.token_hint}
                  </TableCell>
                  <TableCell className="text-subtle">
                    {date(c.created_at)}
                  </TableCell>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
