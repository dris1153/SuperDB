"use client";

import { useState, useTransition } from "react";
import { IconArrowUpRight, IconInfoCircle } from "@tabler/icons-react";
import { toast } from "sonner";
import { previewAuthorizationUrl, type OAuthServerConfig } from "@/lib/oauth-server";
import { saveOAuthServer } from "@/lib/oauth-server-actions";
import type { OAuthClient } from "@/lib/oauth-clients";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { External } from "./oauth-apps";
import { OAuthEndpoints } from "./oauth-endpoints";
import { DisableServerDialog, DynamicAppsDialog } from "./oauth-server-dialogs";

/**
 * The switch OAuth Apps used to send people to Supabase for, laid out as the original has it.
 * `lib/oauth-server.ts` has what the API accepts and refuses, measured.
 */
export function OAuthServerPage({ projectRef }: { projectRef: string }) {
  const state = useProjectPart<OAuthServerConfig>(projectRef, "oauth-server");
  const refetch = useRefetchPart(projectRef, "oauth-server");

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl text-foreground">OAuth Server</h1>
          <p className="text-sm text-muted-foreground">
            Configure your project to act as an identity provider for third-party applications
          </p>
        </div>
        <External href="https://supabase.com/docs/guides/auth/oauth-server">Docs</External>
      </header>

      {isWaiting(state) ? (
        <Skeleton className="h-28 w-full" />
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : (
        <Settings projectRef={projectRef} config={state.data} onSaved={() => void refetch()} />
      )}
    </div>
  );
}

function Settings({
  projectRef,
  config,
  onSaved,
}: {
  projectRef: string;
  config: OAuthServerConfig;
  onSaved: () => void;
}) {
  // Only for the disable confirm's count. Unread counts as none, as in the original.
  const clients = useProjectPart<{ enabled: boolean; clients: OAuthClient[] }>(projectRef, "oauth-clients");
  const apps = clients.status === "ready" ? clients.data.clients.length : 0;

  const [enabled, setEnabled] = useState(config.enabled);
  const [path, setPath] = useState(config.path);
  const [dynamic, setDynamic] = useState(config.dynamic);
  const [confirm, setConfirm] = useState<"dynamic" | "disable" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const [seen, setSeen] = useState(config);
  if (seen !== config) {
    setSeen(config);
    setEnabled(config.enabled);
    setPath(config.path);
    setDynamic(config.dynamic);
  }

  const changed = enabled !== config.enabled || dynamic !== config.dynamic || path !== config.path;
  const preview = previewAuthorizationUrl(config.siteUrl, path);

  const cancel = () => {
    setEnabled(config.enabled);
    setPath(config.path);
    setDynamic(config.dynamic);
    setError(null);
  };

  const save = () =>
    start(async () => {
      setError(null);
      const result = await saveOAuthServer(projectRef, { enabled, path, dynamic });
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      // Measured: GoTrue picks the change up about a minute later, not at once.
      toast.success("OAuth server settings saved.", { description: "It takes about a minute to take effect." });
      onSaved();
    });

  return (
    <>
      <div className="divide-y divide-border rounded-lg border border-border">
        <Row
          label="Enable the Supabase OAuth Server"
          description="Enable OAuth server functionality for your project to create and manage OAuth applications."
        >
          <Switch
            checked={enabled}
            disabled={busy}
            onCheckedChange={(next) => (!next && apps > 0 ? setConfirm("disable") : setEnabled(next))}
            aria-label="Enable the Supabase OAuth Server"
          />
        </Row>

        {enabled ? (
          <>
            <Row
              label="Site URL"
              description={
                <>
                  The base URL of your application, configured in{" "}
                  <a
                    href={`https://supabase.com/dashboard/project/${projectRef}/auth/url-configuration`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-foreground underline"
                  >
                    Auth URL Configuration
                    <IconArrowUpRight className="size-3.5" aria-hidden />
                  </a>{" "}
                  settings.
                </>
              }
            >
              <Input value={config.siteUrl ?? ""} disabled placeholder="https://example.com" className="w-full sm:w-80" />
            </Row>

            <div>
              <Row
                label="Authorization Path"
                description="Path where you'll implement the OAuth authorization UI (consent screens)."
              >
                <Input
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="/auth/authorize"
                  aria-label="Authorization Path"
                  className="w-full sm:w-80"
                />
              </Row>
              <div className="mx-5 mb-5 flex gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
                <IconInfoCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 space-y-0.5">
                  <div className="text-foreground">Make sure this path is implemented in your application.</div>
                  <p className="break-all text-muted-foreground">
                    Preview Authorization URL:{" "}
                    {preview ? (
                      <a href={preview} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                        {preview}
                      </a>
                    ) : (
                      "Set a Site URL to preview"
                    )}
                  </p>
                </div>
              </div>
            </div>

            <Row
              label="Allow Dynamic OAuth Apps"
              description={
                <>
                  Enable dynamic OAuth app registration. Apps can be registered programmatically via
                  APIs.{" "}
                  <a
                    href="https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication#oauth-client-setup"
                    target="_blank"
                    rel="noreferrer"
                    className="text-foreground underline"
                  >
                    Learn more
                  </a>
                </>
              }
            >
              <Switch
                checked={dynamic}
                disabled={busy}
                onCheckedChange={(next) => (next ? setConfirm("dynamic") : setDynamic(false))}
                aria-label="Allow Dynamic OAuth Apps"
              />
            </Row>
          </>
        ) : null}

        <div className="flex items-center justify-between gap-3 p-4">
          <span className="text-sm text-destructive">{error}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy || !changed} onClick={cancel}>
              Cancel
            </Button>
            <Button size="sm" disabled={busy || !changed} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      </div>

      {/* The saved state, not the switch: these answer only once the server is really on. */}
      {config.enabled && enabled && config.endpoints ? <OAuthEndpoints endpoints={config.endpoints} /> : null}

      <DynamicAppsDialog
        open={confirm === "dynamic"}
        onOpenChange={(open) => !open && setConfirm(null)}
        onConfirm={() => {
          setDynamic(true);
          setConfirm(null);
        }}
      />
      <DisableServerDialog
        apps={apps}
        open={confirm === "disable"}
        onOpenChange={(open) => !open && setConfirm(null)}
        onConfirm={() => {
          setEnabled(false);
          setConfirm(null);
        }}
      />
    </>
  );
}

/** Label and sentence on the left, the control on the right. */
function Row({
  label,
  description,
  children,
}: {
  label: string;
  description: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="text-sm text-foreground">{label}</div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
