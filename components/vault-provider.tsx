"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createVault, unlockVault, type VaultParams } from "@/lib/vault-crypto";
import { forgetKey, recallKey, rememberKey } from "@/lib/vault-store";
import { setupVault, type VaultMeta } from "@/lib/vault-actions";

type VaultState = {
  /** null while the stored key is still being looked up. */
  ready: boolean;
  exists: boolean;
  key: CryptoKey | null;
  unlock: (masterPassword: string) => Promise<void>;
  create: (masterPassword: string) => Promise<void>;
  lock: () => Promise<void>;
};

const VaultContext = createContext<VaultState | null>(null);

export function useVault(): VaultState {
  const context = useContext(VaultContext);
  if (!context) throw new Error("useVault must be used inside <VaultProvider>");
  return context;
}

export function VaultProvider({ meta, children }: { meta: VaultMeta | null; children: ReactNode }) {
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [exists, setExists] = useState(meta !== null);
  const [ready, setReady] = useState(false);

  // A key left over from a previous page load is only useful if a vault still exists server-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = meta ? await recallKey() : null;
      if (!cancelled) {
        setKey(stored);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [meta]);

  const unlock = useCallback(
    async (masterPassword: string) => {
      if (!meta) throw new Error("No vault to unlock");
      const params: VaultParams = { salt: meta.salt, iterations: meta.iterations };
      const derived = await unlockVault(masterPassword, params, meta.check_blob);
      await rememberKey(derived);
      setKey(derived);
    },
    [meta],
  );

  const create = useCallback(async (masterPassword: string) => {
    const { params, checkBlob, key: derived } = await createVault(masterPassword);
    await setupVault({ salt: params.salt, iterations: params.iterations, check_blob: checkBlob });
    await rememberKey(derived);
    setKey(derived);
    setExists(true);
  }, []);

  const lock = useCallback(async () => {
    await forgetKey();
    setKey(null);
  }, []);

  return (
    <VaultContext.Provider value={{ ready, exists, key, unlock, create, lock }}>
      {children}
    </VaultContext.Provider>
  );
}
