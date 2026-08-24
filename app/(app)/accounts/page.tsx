import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";
import { addAccount, listAccounts, removeAccount } from "@/lib/accounts";
import { Button, Card, Empty, Input } from "@/components/ui";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, accounts] = await Promise.all([searchParams, listAccounts()]);

  async function connect(formData: FormData) {
    "use server";
    const pat = String(formData.get("pat") ?? "");
    const label = String(formData.get("label") ?? "").trim() || null;
    try {
      await addAccount(pat, label);
    } catch (e) {
      redirect(`/accounts?error=${encodeURIComponent(e instanceof Error ? e.message : "Failed to add account")}`);
    }
    revalidatePath("/");
    redirect("/accounts");
  }

  async function disconnect(formData: FormData) {
    "use server";
    await removeAccount(String(formData.get("id")));
    revalidatePath("/");
    revalidatePath("/accounts");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-xl">Accounts</h1>
        <p className="text-sm text-fg-subtle">
          Create a token at <span className="font-mono text-fg-muted">supabase.com/dashboard/account/tokens</span>.
          Tokens are encrypted before they are stored and never sent to the browser.
        </p>
      </header>

      <Card className="p-4">
        <form action={connect} className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <label className="mb-1 block text-xs text-fg-subtle" htmlFor="pat">Personal access token</label>
            <Input id="pat" name="pat" type="password" placeholder="sbp_…" autoComplete="off" required className="font-mono" />
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs text-fg-subtle" htmlFor="label">Label (optional)</label>
            <Input id="label" name="label" placeholder="work" autoComplete="off" />
          </div>
          <Button variant="primary" type="submit">Connect</Button>
        </form>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <p className="mt-3 text-xs text-fg-subtle">
          The email is read from the token itself via <span className="font-mono">GET /v1/profile</span> — no need to type it.
        </p>
      </Card>

      {accounts.length === 0 ? (
        <Empty>No account connected yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-2xl text-sm">
            <thead className="border-b border-line bg-panel text-left text-xs text-fg-subtle">
              <tr>
                {["Email", "Username", "Label", "Token", "Added", ""].map((h) => (
                  <th key={h} className="px-3 py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-fg">{a.email}</td>
                  <td className="px-3 py-2 text-fg-muted">{a.username ?? "—"}</td>
                  <td className="px-3 py-2 text-fg-muted">{a.label ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-fg-subtle">sbp_…{a.token_hint}</td>
                  <td className="px-3 py-2 text-fg-subtle">{date(a.created_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <form action={disconnect}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button variant="danger" type="submit" aria-label={`Disconnect ${a.email}`}>
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
