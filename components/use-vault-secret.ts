"use client";

import { useEffect, useState } from "react";
import { decryptJson, encryptJson } from "@/lib/vault-crypto";
import { useVault } from "./vault-provider";

/**
 * The decrypt-edit-encrypt cycle behind every vault field.
 *
 * Shared rather than copied because of `decryptFailed`. Without it the obvious version loses data: a
 * failed decrypt leaves the value empty, which is indistinguishable from nothing being stored, and
 * saving from there writes a null blob over the real one. There is no backup and no undo. The broken
 * version is the one that looks correct, which is exactly why it should exist once.
 *
 * Decryption happens here and only here, never on the server — it never held the plaintext.
 *
 * `message` carries both the decrypt failure and whatever the caller reports after saving: one status
 * line, one piece of state. `decryptFailed` is the one that gates the write.
 */
export function useVaultSecret<T extends object>(blob: string | null | undefined) {
  const { key } = useVault();
  const [value, setValue] = useState<Partial<T>>({});
  const [decryptFailed, setDecryptFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!key || !blob) return;
      try {
        const decrypted = await decryptJson<Partial<T>>(key, blob);
        if (!cancelled) {
          setValue(decrypted);
          setDecryptFailed(false);
        }
      } catch {
        if (!cancelled) {
          setDecryptFailed(true);
          setMessage("Stored credentials could not be decrypted with this vault key.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key, blob]);

  /**
   * Ciphertext for `kept`, or null when there is nothing left to store.
   *
   * Returns undefined when the vault is locked — the signal for "leave the stored blob alone", since
   * there is nothing to re-encrypt and null would delete it. Throws when decryption failed, because
   * writing anything from that state is the data loss this hook exists to prevent.
   */
  async function seal(kept: Partial<T>): Promise<string | null | undefined> {
    if (decryptFailed) throw new Error("Refusing to overwrite a credential that could not be read");
    if (!key) return undefined;
    return Object.keys(kept).length > 0 ? await encryptJson(key, kept) : null;
  }

  return { unlocked: key !== null, value, setValue, decryptFailed, message, setMessage, seal };
}
