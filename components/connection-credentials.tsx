"use client";

import { useState } from "react";
import { saveConnectionSecret, type ConnectionSecret } from "@/lib/vault-actions";
import { METHODS, type Method } from "@/lib/credential-methods";
import { useVaultSecret } from "./use-vault-secret";
import { VaultGate } from "./vault-gate";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";

type Passwords = { supabase_password?: string; email_password?: string };

const FIELD = "mb-1 block text-xs text-subtle";

const EMAIL_LABEL: Record<Method, string> = {
  email: "Supabase account email",
  github: "GitHub account email",
  chatgpt: "ChatGPT account email",
  sso: "SSO account email",
};

/**
 * The vault gate sits around the password fields only. Method and email are plaintext in the
 * database by design — schema.sql calls them out as "what answers whose account is this org" — so
 * gating them behind the master password hid information that was never secret and made a saved
 * credential look lost.
 */
export function ConnectionCredentials({
  connectionId,
  secret,
}: {
  connectionId: string;
  secret: ConnectionSecret | null;
}) {
  const {
    value: passwords,
    setValue: setPasswords,
    decryptFailed,
    message,
    setMessage,
    seal,
  } = useVaultSecret<Passwords>(secret?.vault_blob);

  const [method, setMethod] = useState<Method>(secret?.supabase_login_method ?? "email");
  const [email, setEmail] = useState(secret?.supabase_email ?? "");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);

  const shape = METHODS.find((m) => m.value === method)!;
  const status = message;

  async function save() {
    if (decryptFailed) return;
    setBusy(true);
    setMessage(null);
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
        vaultBlob: await seal(kept),
      });
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save");
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

      {shape.supabasePassword || shape.emailPassword ? (
        <VaultGate>
          {shape.supabasePassword ? (
            <div>
              <label className={FIELD} htmlFor={`sb-pw-${connectionId}`}>
                Supabase password
              </label>
              <Input
                id={`sb-pw-${connectionId}`}
                type={reveal ? "text" : "password"}
                value={passwords.supabase_password ?? ""}
                onChange={(e) => setPasswords({ ...passwords, supabase_password: e.target.value })}
                autoComplete="off"
                className="font-mono"
              />
            </div>
          ) : null}

          {shape.emailPassword ? (
            <div className="mt-3">
              <label className={FIELD} htmlFor={`em-pw-${connectionId}`}>
                Email password
              </label>
              <Input
                id={`em-pw-${connectionId}`}
                type={reveal ? "text" : "password"}
                value={passwords.email_password ?? ""}
                onChange={(e) => setPasswords({ ...passwords, email_password: e.target.value })}
                autoComplete="off"
                className="font-mono"
              />
              <p className="mt-1 text-xs text-subtle">
                The password for the mailbox itself, not for Supabase.
              </p>
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            <Checkbox
              id={`reveal-${connectionId}`}
              checked={reveal}
              onCheckedChange={(v) => setReveal(v === true)}
            />
            <label htmlFor={`reveal-${connectionId}`} className="text-xs text-subtle">
              Show passwords
            </label>
          </div>

          {shape.emailPassword ? (
            <p className="mt-3 text-xs text-warn">
              Encrypted here before it is sent; the server only ever holds ciphertext. Think twice about
              the mailbox password — whoever has it can reset every other service you own.
            </p>
          ) : null}
        </VaultGate>
      ) : (
        <p className="text-xs text-subtle">
          Nothing to store for {shape.label} beyond the address — that account lives wherever you manage it.
        </p>
      )}

      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

      {decryptFailed ? (
        <p className="text-xs text-destructive">
          Saving is disabled. A password is stored for this connection but cannot be read with the
          current vault key, and saving would replace it with nothing — there is no undo. Unlock with
          the master password it was encrypted under to edit it.
        </p>
      ) : null}

      <Button onClick={save} disabled={busy || decryptFailed}>
        {busy ? "Saving…" : "Save credentials"}
      </Button>
    </div>
  );
}
