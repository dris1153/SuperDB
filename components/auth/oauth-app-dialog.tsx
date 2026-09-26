"use client";

import { useState, useTransition } from "react";
import { CLIENT_TYPES, type ClientType } from "@/lib/oauth-clients";
import { createClient } from "@/lib/oauth-client-actions";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Creating a client, and the one moment its secret exists.
 *
 * Measured: `client_secret` comes back in the 201 and in a single-client read, but never in the
 * list — and this app only ever lists. So the dialog stays open after a successful create to show
 * it, and says where it can be had afterwards rather than claiming it is gone for good.
 */
export function CreateOAuthAppDialog({
  projectRef,
  open,
  onOpenChange,
  onCreated,
}: {
  projectRef: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ClientType>("confidential");
  const [uris, setUris] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ clientId: string; secret: string } | null>(null);
  const [busy, start] = useTransition();

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setName("");
    setUris("");
    setType("confidential");
    setError(null);
    setSecret(null);
  }

  const create = () =>
    start(async () => {
      setError(null);
      const result = await createClient(projectRef, {
        name,
        type,
        redirectUris: uris
          .split("\n")
          .map((u) => u.trim())
          .filter(Boolean),
      });

      if (!result.ok) {
        setError(result.reason);
        return;
      }

      onCreated();

      // A public client has no secret to show, so there is nothing to hold the dialog open for.
      if (result.secret) setSecret({ clientId: result.clientId ?? "", secret: result.secret });
      else onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        {secret ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy the client secret now</DialogTitle>
              <DialogDescription>
                This is the only time this app shows it — the list it reads does not carry secrets.
                Supabase can still return it from a single-client read, but nothing here does that.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <Field label="Client ID" value={secret.clientId} />
              <Field label="Client secret" value={secret.secret} />
            </div>

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add an application</DialogTitle>
              <DialogDescription>
                An app that can sign users in with this project as the identity provider.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Type</span>
                <Select value={type} onValueChange={(next) => setType(next as ClientType)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLIENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t === "confidential" ? "Confidential — has a secret" : "Public — no secret"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Redirect URIs, one per line</span>
                <Textarea
                  value={uris}
                  onChange={(e) => setUris(e.target.value)}
                  className="h-24 font-mono text-xs"
                  placeholder="https://example.com/auth/callback"
                  spellCheck={false}
                />
              </label>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>

            <DialogFooter>
              <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={busy || !name.trim() || !uris.trim()} onClick={create}>
                Create application
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 rounded-md border border-border p-2">
        <code className="flex-1 truncate text-xs">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}
