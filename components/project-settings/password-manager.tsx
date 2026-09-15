"use client";

import { useState, useTransition } from "react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import { clearDatabasePassword, saveDatabasePassword } from "@/lib/project-secret-actions";
import { useVaultSecret } from "@/components/use-vault-secret";
import { VaultGate } from "@/components/vault-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Stored = { db_password: string };

/**
 * The database password for one project, encrypted in the browser under the vault key.
 *
 * Supabase shows this password once, when the project is created, and never again — so most people
 * arrive here with nothing to type. Resetting is the other half of this page and lands in its own
 * phase; this one stores what someone already has.
 *
 * **Nothing here can tell a correct password from a typo.** The API never returns one to compare
 * against. That is stated on the page rather than implied away, and there is deliberately no
 * "test connection" button: it would be a second, differently-wrong answer to the same question.
 */
export function PasswordManager({ projectRef, blob }: { projectRef: string; blob: string | null }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm text-muted-foreground">Database password</h2>
      <Card className="p-4">
        <VaultGate>
          <Field projectRef={projectRef} blob={blob} />
        </VaultGate>
      </Card>
    </section>
  );
}

function Field({ projectRef, blob }: { projectRef: string; blob: string | null }) {
  const { value, setValue, decryptFailed, message, setMessage, seal } = useVaultSecret<Stored>(blob);
  const [reveal, setReveal] = useState(false);
  const [pending, startTransition] = useTransition();

  const password = value.db_password ?? "";

  /**
   * There is a window where the guard says everything is fine and a save would still destroy the
   * blob: between mount and the decrypt resolving, `value` is `{}` and `decryptFailed` is false, so
   * `seal({})` returns null and a save would delete the row. `decryptFailed` cannot cover it — the
   * blob decrypts perfectly, it just has not finished yet.
   */
  const decrypting = blob !== null && !decryptFailed && value.db_password === undefined;
  const blocked = decryptFailed || decrypting || pending;

  const save = () =>
    startTransition(async () => {
      setMessage(null);
      try {
        // An empty field means "remove it", and it says so rather than reaching the same place by
        // handing a null down two layers of optional arguments.
        const result = password
          ? await saveDatabasePassword(projectRef, (await seal({ db_password: password })) ?? "")
          : await clearDatabasePassword(projectRef);

        setMessage(result.ok ? "Saved." : result.reason);
      } catch {
        setMessage("Could not reach the server.");
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type={reveal ? "text" : "password"}
          value={password}
          onChange={(e) => setValue({ db_password: e.target.value })}
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
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>

      <p className="text-xs text-subtle">
        Encrypted in this browser before it is sent. The server stores it and cannot read it —
        and cannot check it either: Supabase never returns a database password, so a typo is stored
        as faithfully as the real thing.
      </p>

      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
    </div>
  );
}
