"use client";

import { useMemo, useState, useTransition } from "react";
import { IconArrowUpRight, IconInfoSquareRounded, IconPlus, IconSearch } from "@tabler/icons-react";
import { toast } from "sonner";
import { timestamp } from "@/lib/format";
import { CLIENT_TYPES, type OAuthClient } from "@/lib/oauth-clients";
import { removeClient } from "@/lib/oauth-client-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Empty } from "@/components/ui/empty-state";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { CreateOAuthAppDialog } from "./oauth-app-dialog";

type ClientsPart = { enabled: boolean; clients: OAuthClient[] };

const ALL = "all";

/**
 * The apps that can sign users in with this project, laid out as the original has it.
 *
 * **The page does not disappear when the server is off.** It used to return early and show a
 * paragraph in place of everything; the original keeps the notice, the toolbar and the empty table
 * together, so whoever arrives can see what they would be switching on. The endpoint answers 404
 * `feature_disabled` in that state, which the reader turns into `enabled: false` rather than an error.
 *
 * **Filtering happens here, in the browser, and that is right for this list.** It arrives whole —
 * one response, no paging — which is the opposite of the users list, where filtering client-side
 * would have meant paging every user of a project into the browser to search them.
 */
export function OAuthApps({ projectRef }: { projectRef: string }) {
  const state = useProjectPart<ClientsPart>(projectRef, "oauth-clients");
  const refetch = useRefetchPart(projectRef, "oauth-clients");

  const [search, setSearch] = useState("");
  const [registration, setRegistration] = useState(ALL);
  const [clientType, setClientType] = useState(ALL);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, start] = useTransition();

  const data = state.status === "ready" ? state.data : null;
  const enabled = data?.enabled ?? false;
  const clients = useMemo(() => data?.clients ?? [], [data]);

  // From the rows rather than a list written here: `manual` is the only value measured, and a
  // hard-coded list would offer options nobody has and miss ones Supabase adds.
  const registrations = useMemo(
    () => [...new Set(clients.map((c) => c.registration_type).filter((r): r is string => !!r))],
    [clients],
  );

  const needle = search.trim().toLowerCase();
  const shown = clients.filter(
    (c) =>
      (registration === ALL || c.registration_type === registration) &&
      (clientType === ALL || c.client_type === clientType) &&
      (!needle ||
        (c.client_name ?? "").toLowerCase().includes(needle) ||
        c.client_id.toLowerCase().includes(needle)),
  );

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

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl text-foreground">OAuth Apps</h1>
        <External href="https://supabase.com/docs/guides/auth">Docs</External>
      </header>

      {isWaiting(state) ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : state.status !== "ready" || !data ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : (
        <>
          {enabled ? null : (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-5">
              <div className="flex items-start gap-3">
                <IconInfoSquareRounded className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div className="space-y-1">
                  <div className="text-sm text-foreground">OAuth Server is disabled</div>
                  <p className="text-sm text-muted-foreground">
                    Enable OAuth Server to make your project act as an identity provider for
                    third-party applications.
                  </p>
                  {/* Measured: GoTrue picked the flag up about a minute later, not at once. Without
                      this line the page reads as broken to whoever just turned it on. */}
                  <p className="text-xs text-subtle">
                    It takes about a minute to take effect once switched on.
                  </p>
                </div>
              </div>
              {/* The one way to use this page at all, so it exists — unlike the other buttons this
                  app declined to copy — and it says it leaves the app. */}
              <External href={`https://supabase.com/dashboard/project/${projectRef}/auth/providers`}>
                OAuth Server Settings
              </External>
            </div>
          )}

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <IconSearch className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search OAuth apps"
                    className="h-8 w-64 pl-8"
                  />
                </div>

                <Filter
                  value={registration}
                  onChange={setRegistration}
                  label="Registration Type"
                  options={registrations}
                />
                <Filter
                  value={clientType}
                  onChange={setClientType}
                  label="Client Type"
                  options={[...CLIENT_TYPES]}
                />
              </div>

              {enabled ? (
                <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
                  <IconPlus className="size-4" />
                  New OAuth App
                </Button>
              ) : (
                <Tooltip>
                  {/* The wrapper is the trigger, not the button: a disabled button takes no pointer
                      events, so a tooltip on it never opens and the reason stays invisible. */}
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex">
                      <Button size="sm" className="pointer-events-none gap-2" disabled>
                        <IconPlus className="size-4" />
                        New OAuth App
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>OAuth server must be enabled in settings</TooltipContent>
                </Tooltip>
              )}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <Head>Name</Head>
                    <Head>Client ID</Head>
                    <Head>Client Type</Head>
                    <Head>Registration Type</Head>
                    <Head>Created</Head>
                    <TableHead />
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {shown.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="py-4 text-sm text-muted-foreground">
                        {clients.length === 0 ? "No OAuth apps found" : "No OAuth apps match"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    shown.map((client) => (
                      <TableRow key={client.client_id}>
                        <TableCell className="text-sm">{client.client_name || "-"}</TableCell>
                        <TableCell className="font-mono text-xs">{client.client_id}</TableCell>
                        <TableCell className="text-sm capitalize">{client.client_type}</TableCell>
                        <TableCell className="text-sm capitalize">
                          {client.registration_type || "-"}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {timestamp(client.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => remove(client)}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}

      <CreateOAuthAppDialog
        projectRef={projectRef}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void refetch()}
      />
    </div>
  );
}

/** The original's header style: small, uppercase, letter-spaced, mono. */
const Head = ({ children }: { children: React.ReactNode }) => (
  <TableHead className="font-mono text-[11px] font-normal tracking-widest whitespace-nowrap text-muted-foreground uppercase">
    {children}
  </TableHead>
);

function Filter({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (next: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto gap-2 border-dashed">
        {/* The label stays visible until something is chosen, as the original's does. */}
        {value === ALL ? <span>{label}</span> : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option} className="capitalize">
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A button that leaves the app, and shows that it does rather than pretending to navigate. */
function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="outline" size="sm" className="gap-1.5">
      <a href={href} target="_blank" rel="noreferrer">
        {children}
        <IconArrowUpRight className="size-3.5" aria-hidden />
      </a>
    </Button>
  );
}
