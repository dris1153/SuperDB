"use client";

import { useEffect, useState } from "react";
import { decryptJson, encryptJson } from "@/lib/vault-crypto";
import { saveConnectionSecret, type ConnectionSecret } from "@/lib/vault-actions";
import { useVault } from "./vault-provider";
import { VaultGate } from "./vault-gate";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Passwords = { supabase_password?: string; email_password?: string };
type Method = NonNullable<ConnectionSecret["supabase_login_method"]>;

/**
 * Mirrors the Supabase dashboard sign-in page, which offers GitHub, ChatGPT, SSO and email+password.
 * There is deliberately no Google option — it does not exist there.
 *
 * Which passwords are worth storing follows from the method: a social sign-in needs no password here
 * (that account is managed wherever you manage it), email+password needs both the Supabase password
 * and the one for the mailbox behind it, and SSO needs only the identity provider's.
 */
const METHODS: { value: Method; label: string; supabasePassword: boolean; emailPassword: boolean }[] = [
  { value: "email", label: "Email + password", supabasePassword: true, emailPassword: true },
  { value: "github", label: "GitHub", supabasePassword: false, emailPassword: false },
  { value: "chatgpt", label: "ChatGPT", supabasePassword: false, emailPassword: false },
  { value: "sso", label: "SSO", supabasePassword: false, emailPassword: true },
];

const FIELD = "mb-1 block text-xs text-subtle";

const EMAIL_LABEL: Record<Method, string> = {
  email: "Supabase account email",
  github: "GitHub account email",
  chatgpt: "ChatGPT account email",
  sso: "SSO account email",
};

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
  const [method, setMethod] = useState<Method>(secret?.supabase_login_method ?? "email");
  const [email, setEmail] = useState(secret?.supabase_email ?? "");
  const [passwords, setPasswords] = useState<Passwords>({});
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Decryption happens here, never on the server — it never held the plaintext to begin with.
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

  const shape = METHODS.find((m) => m.value === method)!;

  async function save() {
    if (!key) return;
    setBusy(true);
    setStatus(null);
    try {
      // Only keep what this method actually uses, so switching away does not leave a stale password
      // encrypted in the blob.
      const kept: Passwords = {
        ...(shape.supabasePassword && passwords.supabase_password
          ? { supabase_password: passwords.supabase_password }
          : {}),
        ...(shape.emailPassword && passwords.email_password
          ? { email_password: passwords.email_password }
          : {}),
      };

      await saveConnectionSecret({
        connectionId,
        supabaseLoginMethod: method,
        supabaseEmail: email,
        vaultBlob: Object.keys(kept).length > 0 ? await encryptJson(key, kept) : null,
      });
      setStatus("Saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={FIELD} htmlFor={`method-${connectionId}`}>
          Supabase sign-in method
        </label>
        <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
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
        <label className={FIELD} htmlFor={`email-${connectionId}`}>
          {EMAIL_LABEL[method]}
        </label>
        <Input
          id={`email-${connectionId}`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="off"
        />
      </div>

      {shape.supabasePassword ? (
        <div>
          <label className={FIELD} htmlFor={`sb-pw-${connectionId}`}>
            Supabase password
          </label>
          <Input
            id={`sb-pw-${connectionId}`}
            type={reveal ? "text" : "password"}
            value={passwords.supabase_password ?? ""}
            onChange={(e) => setPasswords((p) => ({ ...p, supabase_password: e.target.value }))}
            autoComplete="off"
            className="font-mono"
          />
        </div>
      ) : null}

      {shape.emailPassword ? (
        <div>
          <label className={FIELD} htmlFor={`em-pw-${connectionId}`}>
            Email password
          </label>
          <Input
            id={`em-pw-${connectionId}`}
            type={reveal ? "text" : "password"}
            value={passwords.email_password ?? ""}
            onChange={(e) => setPasswords((p) => ({ ...p, email_password: e.target.value }))}
            autoComplete="off"
            className="font-mono"
          />
          <p className="mt-1 text-xs text-subtle">
            The password for the mailbox itself, not for Supabase.
          </p>
        </div>
      ) : null}

      {shape.supabasePassword || shape.emailPassword ? (
        <div className="flex items-center gap-2">
          <Checkbox
            id="reveal-passwords"
            checked={reveal}
            onCheckedChange={(v) => setReveal(v === true)}
          />
          <label htmlFor="reveal-passwords" className="text-xs text-subtle">
            Show passwords
          </label>
        </div>
      ) : (
        <p className="text-xs text-subtle">
          Nothing to store for {shape.label} beyond the address — that account lives wherever you manage it.
        </p>
      )}

      {shape.emailPassword ? (
        <p className="text-xs text-warn">
          Encrypted here before it is sent; the server only ever holds ciphertext. Think twice about the
          mailbox password — whoever has it can reset every other service you own.
        </p>
      ) : null}

      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

      <Button onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save credentials"}
      </Button>
    </div>
  );
}
