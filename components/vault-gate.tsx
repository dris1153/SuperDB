"use client";

import { useState, type ReactNode } from "react";
import { IconLock, IconLockOpen } from "@tabler/icons-react";
import { WrongMasterPassword } from "@/lib/vault-crypto";
import { useVault } from "./vault-provider";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

/** Renders children only once the vault is open; otherwise asks for the master password. */
export function VaultGate({ children }: { children: ReactNode }) {
  const { ready, exists, key, unlock, create } = useVault();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <p className="text-sm text-subtle">Checking vault…</p>;
  if (key) return <>{children}</>;

  async function submit() {
    setError(null);
    if (!exists && password !== confirmation) {
      setError("The two passwords do not match");
      return;
    }
    setBusy(true);
    try {
      if (exists) await unlock(password);
      else await create(password);
      setPassword("");
      setConfirmation("");
    } catch (e) {
      setError(e instanceof WrongMasterPassword ? "Wrong master password" : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <IconLock size={15} stroke={1.5} className="text-warn" />
        {exists ? "Vault locked" : "No vault yet"}
      </div>

      {exists ? (
        <p className="text-xs text-subtle">
          Credentials are encrypted in your browser. Unlock to read or change them.
        </p>
      ) : (
        <p className="text-xs text-warn">
          Choose a master password. It is not your sign-in password, it never leaves this browser, and
          there is no way to recover it — lose it and every stored credential is gone for good.
        </p>
      )}

      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Master password"
        autoComplete="off"
        minLength={8}
      />
      {!exists ? (
        <Input
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="Confirm master password"
          autoComplete="off"
        />
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button onClick={submit} disabled={busy || password.length < 8}>
        <IconLockOpen size={15} stroke={1.5} />
        {busy ? "Working…" : exists ? "Unlock" : "Create vault"}
      </Button>
    </div>
  );
}
