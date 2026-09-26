"use client";

import { useState, useTransition } from "react";
import { IconCopy, IconKey, IconTrash } from "@tabler/icons-react";
import { createStandbyKey, deleteKey, revokeKey, rotateToStandby } from "@/lib/signing-key-actions";
import {
  groupKeys,
  statusBadge,
  tokenLifetime,
  type SigningKeyRow,
  type SigningKeysPart,
} from "@/lib/signing-keys";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { CreateStandbyDialog } from "./create-standby-dialog";
import { DeleteSigningKeyConfirm, RotateConfirm } from "./jwt-key-dialogs";
import { LegacyJwtSecret } from "./legacy-jwt-secret";
import { RevokeConfirm } from "./revoke-confirm";
import { KeyMenu, SigningKeyTable } from "./signing-key-table";
import { Tab } from "@/components/tab";

type Result = { ok: true } | { ok: false; reason: string };

/**
 * The keys that sign this project's JWTs.
 *
 * **Nothing on this page is a secret.** `private_jwk` is accepted when a key is created and never
 * returned — measured 2026-09-25 — so unlike the API keys page next door there is no value to
 * reveal, mask or copy. What this shows is a lifecycle: which key signs now, which ones still
 * verify the tokens they signed, and which have been withdrawn.
 *
 * **One return, and the dialogs are outside the branches.** A part that stops being `ready` — which
 * happens on a refused refetch, not only on a hard failure — would otherwise unmount an open
 * confirm mid-write: the write would land and the page would show a read error over the top of it.
 */
export function JwtKeys({ projectRef, projectName }: { projectRef: string; projectName: string }) {
  const state = useProjectPart<SigningKeysPart>(projectRef, "signing-keys");
  const refetch = useRefetchPart(projectRef, "signing-keys");
  const ready = state.status === "ready" ? state.data : undefined;
  const { current, standby, previous, revoked, other } = groupKeys(ready?.keys);

  const [tab, setTab] = useState<"signing" | "legacy">("signing");
  const [creating, setCreating] = useState(false);
  const [rotating, setRotating] = useState<SigningKeyRow | null>(null);
  const [revoking, setRevoking] = useState<SigningKeyRow | null>(null);
  const [deleting, setDeleting] = useState<SigningKeyRow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Cleared wherever a dialog opens or closes, not only where it submits. A 429 names the moment the
  // throttle lifts and a delete refusal names a date thirty days out; either one left standing would
  // greet the next key with a deadline that belongs to a different attempt.
  const ask =
    (setter: (key: SigningKeyRow | null) => void) =>
    (key: SigningKeyRow | null) => {
      setter(key);
      setProblem(null);
    };
  const askToRotate = ask(setRotating);
  const askToRevoke = ask(setRevoking);
  const askToDelete = ask(setDeleting);

  const run = (act: () => Promise<Result>, done: () => void) =>
    startTransition(async () => {
      setProblem(null);
      try {
        const result = await act();
        if (!result.ok) return setProblem(result.reason);
        await refetch();
        done();
      } catch {
        setProblem("Could not reach the server.");
      }
    });

  // HS256 is the symmetric legacy. It stays listed under signing keys too, where it is one key among
  // several; the other tab is where it is explained.
  const legacy = (ready?.keys ?? []).filter((key) => key.algorithm === "HS256");

  // The current key and any standby share one table, told apart by the status badge — which is what
  // that column is for, and how the original reads.
  const active = [...(current ? [current] : []), ...standby, ...other];

  const menu = (key: SigningKeyRow, extra?: React.ReactNode) => (
    <KeyMenu label={`Actions for the ${statusBadge(key.status).label.toLowerCase()}`}>
      {/* `.catch` for the same reason the table editor's menus have one: writeText rejects when the
          document is not focused, and a dropped rejection surfaces as a console error. */}
      <DropdownMenuItem onSelect={() => navigator.clipboard?.writeText(key.id).catch(() => {})}>
        <IconCopy size={13} stroke={1.5} />
        Copy key ID
      </DropdownMenuItem>
      {extra}
    </KeyMenu>
  );

  return (
    <section className="space-y-4">
      <div className="flex gap-4 border-b border-border">
        <Tab active={tab === "signing"} onClick={() => setTab("signing")}>
          JWT Signing Keys
        </Tab>
        <Tab active={tab === "legacy"} onClick={() => setTab("legacy")}>
          Legacy JWT Secret
        </Tab>
      </div>

      {isWaiting(state) ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : state.status !== "ready" ? (
        <Empty>
          Could not read this project&apos;s signing keys.
          <span className="mt-1 block text-xs">{reasonOf(state)}</span>
          <span className="mt-1 block text-xs">A paused project has no auth service to answer.</span>
        </Empty>
      ) : tab === "legacy" ? (
        <LegacyJwtSecret
          projectRef={projectRef}
          keys={legacy}
          busy={pending}
          onRevoke={askToRevoke}
        />
      ) : (
        <div className="space-y-8">
          <Card className="flex flex-wrap items-start justify-between gap-4 p-4">
            <div className="min-w-0 max-w-md space-y-1">
              {/* Styled as a card label, so not a heading: it sits above the page's h2s and would
                  put an h3 before them in the outline. */}
              <p className="text-[11px] tracking-wider text-foreground uppercase">
                Create standby key
              </p>
              <p className="text-xs text-subtle">
                Set up a new key which you can switch to once it has been picked up by all components
                of your application.
              </p>
            </div>

            <Button size="sm" onClick={() => setCreating(true)}>
              <IconKey size={13} stroke={1.5} />
              Create Standby Key
            </Button>
          </Card>

          <SigningKeyTable
            keys={active}
            empty="This project has no key in use."
            actions={(key) =>
              menu(
                key,
                key.status === "standby" ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => askToRotate(key)}>
                      <IconKey size={13} stroke={1.5} />
                      Use this key
                    </DropdownMenuItem>
                  </>
                ) : null,
              )
            }
          />

          {previous.length > 0 ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-lg text-foreground">Previously used keys</h2>
                <p className="text-sm text-subtle">
                  These JWT signing keys are still used to verify tokens that are yet to expire.
                  Revoke once all tokens have expired.
                </p>
              </div>

              <SigningKeyTable
                keys={previous}
                timeColumn="Last rotated at"
                actions={(key) =>
                  menu(
                    key,
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => askToRevoke(key)}>
                        <IconKey size={13} stroke={1.5} />
                        Revoke
                      </DropdownMenuItem>
                    </>,
                  )
                }
              />
            </div>
          ) : null}

          {revoked.length > 0 ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <h2 className="text-lg text-foreground">Revoked keys</h2>
                <p className="text-sm text-subtle">
                  Withdrawn from JWKS. Tokens they signed no longer verify. Supabase keeps them for a
                  while before they can be deleted.
                </p>
              </div>

              <SigningKeyTable
                keys={revoked}
                timeColumn="Revoked"
                actions={(key) =>
                  menu(
                    key,
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => askToDelete(key)}>
                        <IconTrash size={13} stroke={1.5} />
                        Delete
                      </DropdownMenuItem>
                    </>,
                  )
                }
              />
            </div>
          ) : null}
        </div>
      )}

      <CreateStandbyDialog
        open={creating}
        onOpenChange={setCreating}
        onSubmit={async (algorithm) => {
          const result = await createStandbyKey(projectRef, algorithm);
          // Refetched rather than patched: the API assigns the id and the JWK, and inventing either
          // here would put a row on screen that is not the row.
          if (result.ok) await refetch();
          return result;
        }}
      />

      <RotateConfirm
        open={rotating !== null}
        onOpenChange={(next) => !next && askToRotate(null)}
        algorithm={rotating?.algorithm ?? "standby"}
        outgoing={current?.algorithm ?? null}
        busy={pending}
        error={problem}
        onConfirm={() =>
          rotating && run(() => rotateToStandby(projectRef, rotating.id), () => setRotating(null))
        }
      />

      <RevokeConfirm
        open={revoking !== null}
        onOpenChange={(next) => !next && askToRevoke(null)}
        projectName={projectName}
        algorithm={revoking?.algorithm ?? "signing"}
        lifetime={tokenLifetime(ready?.jwtExp ?? null)}
        busy={pending}
        error={problem}
        onConfirm={() =>
          revoking && run(() => revokeKey(projectRef, revoking.id), () => setRevoking(null))
        }
      />

      <DeleteSigningKeyConfirm
        open={deleting !== null}
        onOpenChange={(next) => !next && askToDelete(null)}
        algorithm={deleting?.algorithm ?? "signing"}
        busy={pending}
        error={problem}
        onConfirm={() =>
          deleting && run(() => deleteKey(projectRef, deleting.id), () => setDeleting(null))
        }
      />
    </section>
  );
}
