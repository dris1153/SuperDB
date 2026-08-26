"use client";

import { IconLock, IconLockOpen } from "@tabler/icons-react";
import { useVault } from "./vault-provider";
import { VaultGate } from "./vault-gate";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function VaultStatus() {
  const { ready, exists, key, lock } = useVault();

  if (!ready) return <p className="text-sm text-subtle">Checking vault…</p>;

  if (!exists || !key) {
    return <VaultGate>{null}</VaultGate>;
  }

  return (
    <div className="space-y-3">
      <Badge variant="outline" className="rounded-full border-brand-border text-primary">
        <IconLockOpen size={12} stroke={1.5} /> unlocked
      </Badge>
      <p className="text-sm text-subtle">
        The key is held in this browser only and expires after a few hours. Locking removes it
        immediately — stored credentials stay encrypted either way.
      </p>
      <Button variant="outline" size="sm" onClick={() => void lock()} className="self-start">
        <IconLock size={14} stroke={1.5} />
        Lock vault
      </Button>
    </div>
  );
}
