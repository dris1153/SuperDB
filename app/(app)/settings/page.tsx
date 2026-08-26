import { Suspense } from "react";
import { IconShieldCheck, IconShieldOff } from "@tabler/icons-react";
import { requireUser } from "@/lib/supabase/server";
import { removeFactor } from "@/lib/mfa-actions";
import { deleteAccount } from "@/lib/account-actions";
import { MfaEnroll } from "@/components/mfa-enroll";
import { ConfirmAction } from "@/components/confirm-action";
import { VaultStatus } from "@/components/vault-status";
import { ToastFromParams } from "@/components/toast-from-params";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

const HEAD = "text-xs font-normal text-subtle";

type EventRow = {
  id: number;
  owner: string | null;
  kind: string | null;
  event: string;
  detail: string | null;
  ip: string | null;
  created_at: string;
};

const EVENT_TONE: Record<string, string> = {
  connected: "rounded-full border-brand-border text-primary",
  disconnected: "rounded-full",
  refreshed: "rounded-full",
  refresh_failed: "rounded-full border-destructive/40 text-destructive",
};

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();

  const [{ data: factors }, { data: events }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase
      .from("connection_events")
      .select("id, owner, kind, event, detail, ip, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <Suspense fallback={null}>
        <ToastFromParams />
      </Suspense>

      <header>
        <h1 className="text-xl">Settings</h1>
        <p className="text-sm text-subtle">{user.email}</p>
      </header>

      <Card className="gap-3 p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm text-foreground">Two-factor authentication</h2>
          {verified.length > 0 ? (
            <Badge
              variant="outline"
              className="rounded-full border-brand-border text-primary"
            >
              <IconShieldCheck size={12} stroke={1.5} /> on
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="rounded-full border-warn/40 text-warn"
            >
              <IconShieldOff size={12} stroke={1.5} /> off
            </Badge>
          )}
        </div>

        <p className="text-sm text-subtle">
          A stolen password otherwise gives write access to every Supabase
          project you have connected here. This is the single most valuable
          thing you can turn on.
        </p>

        {verified.length > 0 ? (
          <div className="space-y-2">
            {verified.map((factor) => (
              <form
                key={factor.id}
                action={removeFactor}
                className="flex items-center gap-3"
              >
                <input type="hidden" name="factorId" value={factor.id} />
                <span className="text-sm text-muted-foreground">
                  {factor.friendly_name ?? "Authenticator"}
                </span>
                <Button variant="destructive" size="sm" type="submit">
                  Remove
                </Button>
              </form>
            ))}
          </div>
        ) : (
          <MfaEnroll />
        )}
      </Card>

      <Card className="gap-3 p-4">
        <h2 className="text-sm text-foreground">Credential vault</h2>
        <p className="text-sm text-subtle">
          Account passwords are encrypted in your browser with a master password
          the server never sees. Nobody running this instance can read them —
          and nobody can recover them for you.
        </p>
        <VaultStatus />
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm text-muted-foreground">
          Recent credential activity
        </h2>
        {!events || events.length === 0 ? (
          <Empty>Nothing recorded yet.</Empty>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table className="min-w-2xl">
              <TableHeader className="bg-card">
                <TableRow className="hover:bg-transparent">
                  {["When", "Event", "Connection", "Kind", "IP"].map((h) => (
                    <TableHead key={h} className={HEAD}>
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(events as EventRow[]).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-subtle">
                      {new Date(e.created_at).toLocaleString("en-CA")}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={EVENT_TONE[e.event] ?? "rounded-full"}
                      >
                        {e.event.replace(/_/g, " ")}
                      </Badge>
                      {e.detail ? (
                        <div className="mt-1 max-w-md text-xs text-subtle">
                          {e.detail}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.owner ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-subtle">
                      {e.kind ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-subtle">
                      {e.ip ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <Card className="gap-3 border-destructive/40 p-4">
        <h2 className="text-sm text-destructive">Delete account</h2>
        <p className="text-sm text-subtle">
          Revokes every OAuth grant, deletes every stored token, and removes the
          account. Access tokens you pasted keep working in Supabase until you
          revoke them there.
        </p>
        <ConfirmAction
          action={deleteAccount}
          title="Delete this account?"
          description="This cannot be undone. OAuth grants are revoked in Supabase and every stored token is destroyed."
          confirmLabel="Delete account"
          triggerLabel="Delete account"
        />
      </Card>
    </div>
  );
}
