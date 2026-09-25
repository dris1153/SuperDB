"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { date } from "@/lib/format";
import { displayNameOf, isBanned, providersOf, type AuthUser } from "@/lib/auth-users";
import {
  removeUserFactor,
  sendUserLink,
  setUserBan,
  type UserResult,
} from "@/lib/auth-user-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { BanDialog, DeleteUserConfirm, MAIL_QUOTA_NOTE } from "./user-dialogs";
import { UserLogs } from "./user-logs";
import { deleteProjectUser } from "@/lib/auth-user-actions";

type Factor = { id: string; factor_type: string; friendly_name?: string | null; status: string };
type UserDetail = { user: AuthUser & Record<string, unknown>; factors: Factor[] };

/**
 * One user, read again rather than rendered from the row that opened it.
 *
 * A listed user has `identities: null` — measured — so Provider Information exists only in a single
 * read. The panel is also where the actions live, and it refetches itself after each one rather
 * than patching what it holds: a ban changes `banned_until`, and a lifted ban leaves the old value
 * behind.
 */
export function UserPanel({
  projectRef,
  userId,
  onClose,
  onChanged,
}: {
  projectRef: string;
  userId: string | null;
  onClose: () => void;
  /** The table's own page is stale after a delete or a ban, and only it can refetch that. */
  onChanged: () => void;
}) {
  const params = userId ? { id: userId } : undefined;
  const state = useProjectPart<UserDetail>(projectRef, "auth-user", params, {
    enabled: userId !== null,
  });
  const refetch = useRefetchPart(projectRef, "auth-user", params);

  const [banOpen, setBanOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const detail = state.status === "ready" ? state.data : null;
  const user = detail?.user ?? null;
  const banned = user ? isBanned(user) : false;

  // One place where an action's answer is turned into an outcome, so no caller can forget to show
  // the reason a write was refused.
  const run = (action: () => Promise<UserResult>, done: string, after?: () => void) =>
    start(async () => {
      setError(null);
      const result = await action();

      if (!result.ok) {
        setError(result.reason);
        return;
      }

      toast.success(done);
      await refetch();
      onChanged();
      after?.();
    });

  return (
    <Sheet open={userId !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="truncate">
            {user ? (displayNameOf(user) ?? user.email ?? "User") : "User"}
          </SheetTitle>
          <SheetDescription className="truncate font-mono text-xs">{userId}</SheetDescription>
        </SheetHeader>

        {isWaiting(state) ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : state.status !== "ready" || !user ? (
          <p className="p-4 text-sm text-subtle">{reasonOf(state) ?? "This user is unavailable."}</p>
        ) : (
          <Tabs defaultValue="overview" className="p-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
              <TabsTrigger value="raw">Raw JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-6 pt-4">
              <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
                <Field label="Email">{user.email}</Field>
                <Field label="Confirmed at">
                  {/* Absent, not null, on a user created without auto-confirm — so a dash here
                      means "never confirmed" rather than "not read". */}
                  {user.email_confirmed_at ? date(user.email_confirmed_at) : "Waiting for confirmation"}
                </Field>
                <Field label="Phone">{user.phone}</Field>
                <Field label="Created at">{date(user.created_at)}</Field>
                <Field label="Last sign in">{date(user.last_sign_in_at)}</Field>
                <Field label="Status">
                  {banned ? (
                    <Badge variant="outline" className="text-destructive">
                      Banned until {date(user.banned_until ?? null)}
                    </Badge>
                  ) : (
                    "Active"
                  )}
                </Field>
              </dl>

              <section className="space-y-2">
                <h3 className="text-sm text-foreground">Provider information</h3>
                <Identities user={user} />
              </section>

              <section className="space-y-2">
                <h3 className="text-sm text-foreground">Send an email</h3>
                <p className="text-xs text-subtle">{MAIL_QUOTA_NOTE}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !user.email}
                    onClick={() =>
                      run(
                        () => sendUserLink(projectRef, "magiclink", user.email ?? ""),
                        "Magic link sent.",
                      )
                    }
                  >
                    Send magic link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !user.email}
                    onClick={() =>
                      run(
                        () => sendUserLink(projectRef, "recovery", user.email ?? ""),
                        "Password recovery sent.",
                      )
                    }
                  >
                    Send password recovery
                  </Button>
                </div>
              </section>

              <Factors
                factors={detail?.factors ?? []}
                busy={busy}
                onRemove={(factorId) =>
                  run(() => removeUserFactor(projectRef, user.id, factorId), "Factor removed.")
                }
              />

              <section className="space-y-2 rounded-lg border border-destructive/40 p-4">
                <h3 className="text-sm text-foreground">Danger zone</h3>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      banned
                        ? run(() => setUserBan(projectRef, user.id, "none"), "Ban lifted.")
                        : setBanOpen(true)
                    }
                  >
                    {banned ? "Lift the ban" : "Ban user"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete user
                  </Button>
                </div>
                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </section>
            </TabsContent>

            {/* Mounted only while selected, which is what keeps the logs endpoint out of the
                request the panel makes when it opens. */}
            <TabsContent value="logs" className="pt-4">
              <UserLogs projectRef={projectRef} userId={user.id} />
            </TabsContent>

            <TabsContent value="raw" className="pt-4">
              {/* The one view that cannot go stale in meaning: whatever GoTrue holds, as it holds it. */}
              <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-4 text-xs">
                {JSON.stringify(user, null, 2)}
              </pre>
            </TabsContent>
          </Tabs>
        )}

        <BanDialog
          open={banOpen}
          onOpenChange={setBanOpen}
          email={user?.email ?? null}
          busy={busy}
          error={error}
          onConfirm={(duration) =>
            user &&
            run(() => setUserBan(projectRef, user.id, duration), "User banned.", () =>
              setBanOpen(false),
            )
          }
        />

        <DeleteUserConfirm
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          email={user?.email ?? null}
          busy={busy}
          error={error}
          onConfirm={(typed) =>
            user &&
            run(
              () => deleteProjectUser(projectRef, user.id, typed, user.email),
              "User deleted.",
              () => {
                setDeleteOpen(false);
                onClose();
              },
            )
          }
        />
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-foreground">{children || "—"}</dd>
    </>
  );
}

function Identities({ user }: { user: AuthUser & { identities?: unknown } }) {
  const identities = Array.isArray(user.identities) ? user.identities : null;

  if (!identities || identities.length === 0) {
    return (
      <p className="text-sm text-subtle">
        {providersOf(user).join(", ") || "No linked identity."}
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {identities.map((identity, i) => {
        const row = identity as { provider?: string; identity_id?: string; last_sign_in_at?: string };
        return (
          <li key={row.identity_id ?? i} className="rounded-md border border-border p-3 text-sm">
            <div className="flex items-center justify-between">
              <Badge variant="outline">{row.provider ?? "unknown"}</Badge>
              <span className="text-xs text-muted-foreground">
                {date(row.last_sign_in_at ?? null)}
              </span>
            </div>
            <div className="truncate pt-1 font-mono text-xs text-subtle">{row.identity_id}</div>
          </li>
        );
      })}
    </ul>
  );
}

/** Offered only when there is one: `/factors` answers `[]` for a user with no MFA, not a 404. */
function Factors({
  factors,
  busy,
  onRemove,
}: {
  factors: Factor[];
  busy: boolean;
  onRemove: (id: string) => void;
}) {
  if (factors.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-sm text-foreground">Multi-factor</h3>
      {factors.map((factor) => (
        <div
          key={factor.id}
          className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
        >
          <span>
            {factor.friendly_name || factor.factor_type}{" "}
            <span className="text-xs text-muted-foreground">{factor.status}</span>
          </span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onRemove(factor.id)}>
            Remove
          </Button>
        </div>
      ))}
    </section>
  );
}
