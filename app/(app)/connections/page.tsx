import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import Link from "next/link";
import { IconAlertTriangle, IconPlugConnected, IconTrash } from "@tabler/icons-react";
import {
  addPatConnection,
  listConnections,
  modeEnabled,
  ownerLabel,
  removeConnection,
} from "@/lib/connections";
import { Badge, Button, buttonClass, Card, Empty, Input } from "@/components/ui";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>;
}) {
  const [{ error, connected }, connections] = await Promise.all([searchParams, listConnections()]);
  const oauth = modeEnabled("oauth");
  const pat = modeEnabled("pat");

  async function connectToken(formData: FormData) {
    "use server";
    const token = String(formData.get("pat") ?? "");
    const label = String(formData.get("label") ?? "").trim() || null;
    try {
      await addPatConnection(token, label);
    } catch (e) {
      redirect(`/connections?error=${encodeURIComponent(e instanceof Error ? e.message : "Failed to connect")}`);
    }
    revalidatePath("/");
    redirect("/connections");
  }

  async function disconnect(formData: FormData) {
    "use server";
    await removeConnection(String(formData.get("id")));
    revalidatePath("/");
    revalidatePath("/connections");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-xl">Connections</h1>
        <p className="text-sm text-fg-subtle">
          Link the Supabase organizations and accounts whose projects you want to see here.
        </p>
      </header>

      {connected ? (
        <Card className="border-brand-border p-4 text-sm text-brand">Connected {connected}.</Card>
      ) : null}
      {error ? (
        <Card className="border-danger/40 p-4 text-sm text-danger">{error}</Card>
      ) : null}

      {/* Neither route dominates, so neither is hidden. Both are limited to one organization by
          Supabase, and neither can see an account email. */}
      <p className="text-sm text-fg-subtle">
        Both routes cover a single organization, so connect once per organization you want to see.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {oauth ? (
          <Card className="flex flex-col p-4">
            <h2 className="text-sm text-fg">Connect with Supabase</h2>
            <p className="mt-1 flex-1 text-sm text-fg-subtle">
              One click, nothing to paste. The grant renews itself and you can revoke it from your own
              Supabase settings at any time. Disk usage and API keys stay hidden — Supabase does not expose
              those over OAuth.
            </p>
            <Link href="/api/connect/start" className={buttonClass("primary", "mt-3 self-start")}>
              <IconPlugConnected size={16} stroke={1.5} />
              Connect with Supabase
            </Link>
          </Card>
        ) : null}

        {pat ? (
          <Card className="flex flex-col p-4">
            <h2 className="text-sm text-fg">Connect with an access token</h2>
            <p className="mt-1 text-sm text-fg-subtle">
              Shows everything, disk usage and API keys included. Create one at{" "}
              <span className="font-mono text-fg-muted">supabase.com/dashboard/account/tokens</span> and grant
              only the capabilities you want. It does not renew, so it stops working when it expires.
            </p>
            <form action={connectToken} className="mt-3 space-y-2">
              <div>
                <label className="mb-1 block text-xs text-fg-subtle" htmlFor="pat">
                  Access token
                </label>
                <Input id="pat" name="pat" type="password" placeholder="sbp_…" autoComplete="off" required className="font-mono" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-fg-subtle" htmlFor="label">
                  Label (optional)
                </label>
                <Input id="label" name="label" placeholder="work" autoComplete="off" />
              </div>
              <Button type="submit" className="self-start">Connect token</Button>
            </form>
          </Card>
        ) : null}
      </div>

      {connections.length === 0 ? (
        <Empty>Nothing connected yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-2xl text-sm">
            <thead className="border-b border-line bg-panel text-left text-xs text-fg-subtle">
              <tr>
                {["Owner", "Kind", "Label", "Token", "Added", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-fg">
                    {ownerLabel(c)}
                    {c.last_error ? (
                      <div className="mt-1 flex items-center gap-1 text-xs text-warn">
                        <IconAlertTriangle size={13} stroke={1.5} />
                        Reconnect required
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={c.kind === "oauth" ? "brand" : "neutral"}>{c.kind}</Badge>
                  </td>
                  <td className="px-3 py-2 text-fg-muted">{c.label ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-fg-subtle">…{c.token_hint}</td>
                  <td className="px-3 py-2 text-fg-subtle">{date(c.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <form action={disconnect}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button variant="danger" type="submit" aria-label={`Disconnect ${ownerLabel(c)}`}>
                        <IconTrash size={15} stroke={1.5} />
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
