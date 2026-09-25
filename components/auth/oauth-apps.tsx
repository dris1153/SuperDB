"use client";

import { useState, useTransition } from "react";
import { IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { date } from "@/lib/format";
import type { OAuthClient } from "@/lib/oauth-clients";
import { removeClient } from "@/lib/oauth-client-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { CreateOAuthAppDialog } from "./oauth-app-dialog";

type ClientsPart = { enabled: boolean; clients: OAuthClient[] };

/**
 * The apps that can sign users in with this project.
 *
 * The OAuth server being off is a state, not a failure: the endpoint answers 404
 * `feature_disabled`, which the reader turns into `enabled: false` so this can show the banner the
 * dashboard shows.
 */
export function OAuthApps({ projectRef }: { projectRef: string }) {
  const state = useProjectPart<ClientsPart>(projectRef, "oauth-clients");
  const refetch = useRefetchPart(projectRef, "oauth-clients");

  const [createOpen, setCreateOpen] = useState(false);
  const [busy, start] = useTransition();

  const data = state.status === "ready" ? state.data : null;

  const remove = (client: OAuthClient) =>
    start(async () => {
      const result = await removeClient(projectRef, client.client_id);
      if (!result.ok) {
        toast.error(result.reason);
        return;
      }
      toast.success("App deleted.");
      await refetch();
    });

  if (isWaiting(state)) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (state.status !== "ready" || !data) return <Empty>{reasonOf(state)}</Empty>;

  if (!data.enabled) {
    return (
      <Card className="space-y-2 p-6 text-sm">
        <h2 className="text-foreground">The OAuth server is off for this project</h2>
        <p className="text-muted-foreground">
          Turning it on makes this project an identity provider that other apps can sign users in
          with. It is a configuration decision rather than a step in creating an app, so it is not
          offered here — enable it under Authentication in the Supabase dashboard, where
          <span className="text-foreground"> OAuth server enabled</span> and
          <span className="text-foreground"> authorization path</span> must be set together.
        </p>
        {/* Measured: GoTrue picked the change up about a minute later, not at once. Without this
            sentence the page looks broken to whoever just turned it on. */}
        <p className="text-subtle">The service takes about a minute to notice the change.</p>
        <a
          className="text-foreground underline underline-offset-4"
          href={`https://supabase.com/dashboard/project/${projectRef}/auth/providers`}
          target="_blank"
          rel="noreferrer"
        >
          Open this project&apos;s auth settings
        </a>
      </Card>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <IconPlus className="size-4" />
          Add application
        </Button>
      </div>

      {data.clients.length === 0 ? (
        <Empty>No applications yet.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs font-normal text-muted-foreground">Name</TableHead>
                <TableHead className="text-xs font-normal text-muted-foreground">Client ID</TableHead>
                <TableHead className="text-xs font-normal text-muted-foreground">Type</TableHead>
                <TableHead className="text-xs font-normal text-muted-foreground">
                  Registration
                </TableHead>
                <TableHead className="text-xs font-normal text-muted-foreground">Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>

            <TableBody>
              {data.clients.map((client) => (
                <TableRow key={client.client_id}>
                  <TableCell className="text-sm">{client.client_name || "—"}</TableCell>
                  <TableCell className="max-w-[14rem] truncate font-mono text-xs" title={client.client_id}>
                    {client.client_id}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {client.client_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{client.registration_type || "—"}</TableCell>
                  <TableCell className="text-sm">{date(client.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(client)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateOAuthAppDialog
        projectRef={projectRef}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void refetch()}
      />
    </section>
  );
}
