"use client";

import { useState, useTransition } from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { generatePassword } from "@/lib/password-generate";
import { resetDatabasePassword } from "@/lib/project-actions";
import { clearDatabasePassword, saveDatabasePassword } from "@/lib/project-secret-actions";
import { CopyButton } from "@/components/copy-button";
import { useVaultSecret } from "@/components/use-vault-secret";
import { VaultGate } from "@/components/vault-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ResetConfirm } from "./reset-confirm";

/**
 * `pending_password` is what makes a failed reset recoverable.
 *
 * It is written *before* the PATCH and collapsed after a 200. The invariant is that `db_password` is
 * never overwritten before Supabase has confirmed — not that nothing is written beforehand, which is
 * what an earlier draft of this said. An indefinite request cannot be told from one that was never
 * sent, and Supabase may have committed anyway; without this field, that case leaves a live password
 * that nobody holds.
 */
type Stored = { db_password?: string; pending_password?: string; pending_at?: string };

/**
 * The database password for one project, encrypted in the browser under the vault key.
 *
 * Supabase shows this password once, when the project is created, and never again — which is why
 * storing one and setting a new one belong on the same page. Most people arrive with nothing to type.
 *
 * **Nothing here can tell a correct password from a typo.** The API never returns one to compare
 * against. That is stated on the page rather than implied away, and there is deliberately no
 * "test connection" button: it would be a second, differently-wrong answer to the same question.
 */
export function PasswordManager({
  projectRef,
  projectName,
  blob,
}: {
  projectRef: string;
  projectName: string;
  blob: string | null;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm text-muted-foreground">Database password</h2>
      <Card className="p-4">
        <VaultGate>
          <Field projectRef={projectRef} projectName={projectName} blob={blob} />
        </VaultGate>
      </Card>
    </section>
  );
}

function Field({
  projectRef,
  projectName,
  blob,
}: {
  projectRef: string;
  projectName: string;
  blob: string | null;
}) {
  const { value, setValue, decryptFailed, message, setMessage, seal } = useVaultSecret<Stored>(blob);
  const [reveal, setReveal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const password = value.db_password ?? "";
  const stranded = value.pending_password;

  /**
   * There is a window where every guard reports health and a save would still destroy the blob:
   * between mount and the decrypt resolving, `value` is `{}` and `decryptFailed` is false, so
   * `seal({})` returns null and a save would delete the row. `decryptFailed` cannot cover it — the
   * blob decrypts perfectly, it just has not finished.
   */
  const decrypting = blob !== null && !decryptFailed && value.db_password === undefined && !stranded;
  const blocked = decryptFailed || decrypting || pending;

  /** Writes the whole blob, or clears it when there is nothing left worth keeping. */
  const store = async (next: Stored) => {
    const sealed = Object.values(next).some(Boolean) ? await seal(next) : null;
    return sealed ? saveDatabasePassword(projectRef, sealed) : clearDatabasePassword(projectRef);
  };

  const save = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await store({ ...value, db_password: password || undefined });
        setMessage(result.ok ? "Saved." : result.reason);
      } catch {
        setMessage("Could not reach the server.");
      }
    });

  const reset = () =>
    startTransition(async () => {
      setMessage(null);
      const fresh = generatePassword();

      try {
        // Before the PATCH. If the vault has locked since this page opened, `seal` returns undefined
        // and this throws here — while Supabase has not been touched and the old password still
        // works. That ordering is the guard.
        const held = await store({ ...value, pending_password: fresh, pending_at: new Date().toISOString() });
        if (!held.ok) {
          setMessage(`Nothing was changed: the new password could not be saved first. ${held.reason}`);
          return;
        }

        const result = await resetDatabasePassword(projectRef, fresh);

        if (result.ok) {
          setValue({ db_password: fresh });
          await store({ db_password: fresh });
          setConfirming(false);
          setMessage("The database password was changed.");
          return;
        }

        if (result.sent) {
          // The request went out and its outcome is unknown. The generated password may already be
          // the live one, so it stays on disk and on screen rather than being thrown away.
          setValue({ ...value, pending_password: fresh, pending_at: new Date().toISOString() });
          setMessage(result.reason);
          return;
        }

        // Supabase was never asked, so the old password certainly still works and the pending entry
        // is noise.
        await store({ ...value, pending_password: undefined, pending_at: undefined });
        setMessage(result.reason);
      } catch {
        setMessage("Could not reach the server. The password was not changed.");
      }
    });

  return (
    <div className="space-y-3">
      {stranded ? (
        <div className="space-y-2 rounded-md border border-warn/40 p-3">
          <p className="text-xs text-warn">
            A reset was sent{value.pending_at ? ` at ${new Date(value.pending_at).toLocaleString()}` : ""} and its
            outcome is unknown. If the password below no longer works, this is the one that was sent.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">{stranded}</code>
            <CopyButton value={stranded} />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setValue({ db_password: stranded });
                  await store({ db_password: stranded });
                  setMessage("Kept as the current password.");
                })
              }
            >
              It worked — keep it
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await store({ ...value, pending_password: undefined, pending_at: undefined });
                  setValue({ ...value, pending_password: undefined, pending_at: undefined });
                  setMessage("Discarded.");
                })
              }
            >
              Discard
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type={reveal ? "text" : "password"}
          value={password}
          onChange={(e) => setValue({ ...value, db_password: e.target.value })}
          disabled={blocked}
          placeholder={decrypting ? "Decrypting…" : "Your database password"}
          aria-label="Database password"
          className="max-w-xs font-mono"
        />
        <Button
          variant="outline"
          size="icon-sm"
          aria-label={reveal ? "Hide password" : "Show password"}
          onClick={() => setReveal((v) => !v)}
          disabled={blocked}
        >
          {reveal ? <IconEyeOff size={13} stroke={1.5} /> : <IconEye size={13} stroke={1.5} />}
        </Button>
        <Button size="sm" onClick={save} disabled={blocked}>
          {pending ? "Working…" : "Save"}
        </Button>
      </div>

      <p className="text-xs text-subtle">
        Encrypted in this browser before it is sent. The server stores it and cannot read it — and
        cannot check it either: Supabase never returns a database password, so a typo is stored as
        faithfully as the real thing.
      </p>

      <div className="space-y-1 border-t border-border pt-3">
        <p className="text-xs text-subtle">
          Supabase shows the database password once, when the project is created. If you no longer
          have it, set a new one.
        </p>
        <Button variant="outline" size="sm" onClick={() => setConfirming(true)} disabled={blocked}>
          Generate a new password
        </Button>
      </div>

      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}

      <ResetConfirm
        open={confirming}
        onOpenChange={(next) => !pending && setConfirming(next)}
        projectName={projectName}
        projectRef={projectRef}
        busy={pending}
        onConfirm={reset}
      />
    </div>
  );
}
