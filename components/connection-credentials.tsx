"use client";

import { useEffect, useState } from "react";
import { decryptJson, encryptJson } from "@/lib/vault-crypto";
import { saveConnectionSecret, type ConnectionSecret } from "@/lib/vault-actions";
import { useVault } from "./vault-provider";
import { VaultGate } from "./vault-gate";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Passwords = { supabase_password?: string; provider_password?: string };

const METHODS = [
  { value: "email", label: "Email + password" },
  { value: "github", label: "GitHub" },
  { value: "google", label: "Google" },
] as const;

const FIELD = "mb-1 block text-xs text-subtle";

export function ConnectionCredentials({
  connectionId,
  secret,
}: {
  connectionId: string;
  secret: ConnectionSecret | null;
}) {
  return (
    <VaultGate>
      <CredentialsForm connectionId={connectionId} secret={secret} />
    </VaultGate>
  );
}

function CredentialsForm({
  connectionId,
  secret,
}: {
  connectionId: string;
  secret: ConnectionSecret | null;
}) {
  const { key } = useVault();
  const [method, setMethod] = useState(secret?.supabase_login_method ?? "email");
  const [supabaseEmail, setSupabaseEmail] = useState(secret?.supabase_email ?? "");
  const [providerEmail, setProviderEmail] = useState(secret?.provider_email ?? "");
  const [passwords, setPasswords] = useState<Passwords>({});
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Decrypting is deferred to here rather than the server, which never held the plaintext.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!key || !secret?.vault_blob) return;
      try {
        const decrypted = await decryptJson<Passwords>(key, secret.vault_blob);
        if (!cancelled) setPasswords(decrypted);
      } catch {
        if (!cancelled) setStatus("Stored credentials could not be decrypted with this vault key.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, secret?.vault_blob]);

  async function save() {
    if (!key) return;
    setBusy(true);
    setStatus(null);
    try {
      const hasPasswords = Boolean(passwords.supabase_password || passwords.provider_password);
      await saveConnectionSecret({
        connectionId,
        supabaseLoginMethod: method,
        supabaseEmail,
        providerEmail: method === "email" ? null : providerEmail,
        vaultBlob: hasPasswords ? await encryptJson(key, passwords) : null,
      });
      setStatus("Saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const social = method !== "email";

  return (
    <div className="space-y-3">
      <div>
        <label className={FIELD} htmlFor={`method-${connectionId}`}>
          Supabase sign-in method
        </label>
        <Select value={method} onValueChange={(v) => setMethod(v as typeof method)}>
          <SelectTrigger id={`method-${connectionId}`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label className={FIELD} htmlFor={`sb-email-${connectionId}`}>
          Supabase account email
        </label>
        <Input
          id={`sb-email-${connectionId}`}
          value={supabaseEmail}
          onChange={(e) => setSupabaseEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="off"
        />
      </div>

      {social ? (
        <div>
          <label className={FIELD} htmlFor={`prov-email-${connectionId}`}>
            {method === "github" ? "GitHub" : "Google"} account email
          </label>
          <Input
            id={`prov-email-${connectionId}`}
            value={providerEmail}
            onChange={(e) => setProviderEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="off"
          />
        </div>
      ) : null}

      <div>
        <label className={FIELD} htmlFor={`sb-pw-${connectionId}`}>
          {social ? `${method === "github" ? "GitHub" : "Google"} password` : "Supabase password"}
        </label>
        <Input
          id={`sb-pw-${connectionId}`}
          type={reveal ? "text" : "password"}
          value={social ? (passwords.provider_password ?? "") : (passwords.supabase_password ?? "")}
          onChange={(e) =>
            setPasswords((p) =>
              social
                ? { ...p, provider_password: e.target.value }
                : { ...p, supabase_password: e.target.value },
            )
          }
          autoComplete="off"
          className="font-mono"
        />
      </div>

      <label className="flex items-center gap-2 text-xs text-subtle">
        <input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} />
        Show password
      </label>

      <p className="text-xs text-warn">
        Passwords are encrypted here before they are sent; the server stores ciphertext it cannot read.
        Think twice about the email account itself — whoever holds that password can reset every other
        service you own.
      </p>

      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

      <Button onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save credentials"}
      </Button>
    </div>
  );
}
