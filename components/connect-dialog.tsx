"use client";

import { useState, type ReactNode } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { SlidingTabsList, SlidingTabsTrigger } from "./sliding-tabs";
import { Tabs, TabsContent } from "./ui/tabs";

export type ConnectInfo = {
  projectUrl: string;
  directConnection: string | null;
  poolerConnection: string | null;
  poolerMode: string | null;
  apiKeys: { name: string; prefix: string | null }[] | null;
  apiKeysBlocked: boolean;
};

function Snippet({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex items-start gap-2">
      <code className="min-w-0 flex-1 rounded-md border border-border bg-background p-2.5 font-mono text-xs break-all text-muted-foreground">
        {value}
      </code>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Copy"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // Denied outside a secure context; the value is on screen to select.
          }
        }}
      >
        {copied ? <IconCheck size={13} stroke={1.5} className="text-primary" /> : <IconCopy size={13} stroke={1.5} />}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs text-subtle">{label}</div>
      {children}
    </div>
  );
}

export function ConnectDialog({ info, children }: { info: ConnectInfo; children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Connect to this project</DialogTitle>
          <DialogDescription>
            Supabase does not expose the database password through its API, so the connection strings
            below carry a placeholder — paste your own in.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="app">
          <SlidingTabsList className="w-full">
            <SlidingTabsTrigger value="app">App</SlidingTabsTrigger>
            <SlidingTabsTrigger value="direct">Direct</SlidingTabsTrigger>
            <SlidingTabsTrigger value="pooler">Pooler</SlidingTabsTrigger>
          </SlidingTabsList>

          <TabsContent value="app" className="space-y-4 pt-3">
            <Field label="Project URL">
              <Snippet value={info.projectUrl} />
            </Field>
            <Field label="API keys">
              {info.apiKeysBlocked ? (
                <p className="text-xs text-subtle">
                  Unavailable over OAuth — reading keys needs the Secrets: Read scope, which also grants
                  access to project secrets.
                </p>
              ) : info.apiKeys && info.apiKeys.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {info.apiKeys.map((k) => (
                    <li key={k.name} className="font-mono">
                      {k.name}
                      {k.prefix ? ` · ${k.prefix}…` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-subtle">No keys returned. Values are never revealed here.</p>
              )}
            </Field>
          </TabsContent>

          <TabsContent value="direct" className="space-y-4 pt-3">
            {info.directConnection ? (
              <Field label="Direct connection · IPv6 unless the IPv4 add-on is enabled">
                <Snippet value={info.directConnection} />
              </Field>
            ) : (
              <p className="text-sm text-subtle">The database host was not returned for this project.</p>
            )}
          </TabsContent>

          <TabsContent value="pooler" className="space-y-4 pt-3">
            {info.poolerConnection ? (
              <Field label={`Supavisor${info.poolerMode ? ` · ${info.poolerMode} mode` : ""}`}>
                <Snippet value={info.poolerConnection} />
              </Field>
            ) : (
              <p className="text-sm text-subtle">Pooler configuration is unavailable for this project.</p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
