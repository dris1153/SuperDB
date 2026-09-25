"use client";

import { useState, useTransition } from "react";
import { IconMail } from "@tabler/icons-react";
import { toast } from "sonner";
import { displayNameOf, isBanned, type AuthUser } from "@/lib/auth-users";
import {
  deleteProjectUser,
  removeUserFactor,
  sendUserLink,
  setUserBan,
  type UserResult,
} from "@/lib/auth-user-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { BanDialog, DeleteUserConfirm, MAIL_QUOTA_NOTE } from "./user-dialogs";
import { ProviderCard } from "./provider-card";
import { UserAttributes } from "./user-attributes";
import { UserLogs } from "./user-logs";

type Factor = { id: string; factor_type: string; friendly_name?: string | null; status: string };
type UserDetail = { user: AuthUser & Record<string, unknown>; factors: Factor[] };

/**
 * One user, read again rather than rendered from the row that opened it.
 *
 * A listed user has `identities: null` — measured — so Provider Information exists only in a single
 * read. The panel is also where the actions live, and it refetches itself after each one rather than
 * patching what it holds: a ban changes `banned_until`, and a lifted ban leaves the old value there.
 *
 * Laid out against the original 2026-09-26: tabs above the header, the name over the email, then the
 * eight-row attribute table, then providers, then the two mail actions, then the danger zone — each
 * action beside the sentence that says what it does.
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
  const factors = detail?.factors ?? [];
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
      <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {isWaiting(state) ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : state.status !== "ready" || !user ? (
          <p className="p-6 text-sm text-subtle">{reasonOf(state) ?? "This user is unavailable."}</p>
        ) : (
          <Tabs defaultValue="overview">
            {/* Tabs first, as the original has them — above the person rather than under them. */}
            <div className="border-b border-border px-6 pt-4">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="logs">Logs</TabsTrigger>
                <TabsTrigger value="raw">Raw JSON</TabsTrigger>
              </TabsList>
            </div>

            <SheetHeader className="gap-1 px-6 pt-6 pb-4">
              <SheetTitle className="truncate text-base">
                {displayNameOf(user) ?? user.email ?? "User"}
              </SheetTitle>
              <SheetDescription asChild>
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate">{user.email ?? user.phone ?? userId}</span>
                  {user.email ? <CopyButton value={user.email} /> : null}
                  {banned ? (
                    <Badge variant="outline" className="text-[10px] text-destructive">
                      Banned
                    </Badge>
                  ) : null}
                </div>
              </SheetDescription>
            </SheetHeader>

            <TabsContent value="overview" className="space-y-8 px-6 pb-10">
              <UserAttributes user={user} />

              <section className="space-y-2">
                <div>
                  <h3 className="text-sm text-foreground">Provider Information</h3>
                  <p className="text-xs text-muted-foreground">
                    The user has the following providers
                  </p>
                </div>
                <ProviderCard user={user} />
              </section>

              <section className="divide-y divide-border rounded-lg border border-border">
                <ActionRow
                  title="Reset password"
                  description="Send a password recovery email to the user"
                  button={
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={busy || !user.email}
                      onClick={() =>
                        run(
                          () => sendUserLink(projectRef, "recovery", user.email ?? ""),
                          "Password recovery sent.",
                        )
                      }
                    >
                      <IconMail className="size-4" />
                      Send password recovery
                    </Button>
                  }
                />
                <ActionRow
                  title="Send magic link"
                  description="Send a passwordless magic link to the user"
                  button={
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      disabled={busy || !user.email}
                      onClick={() =>
                        run(
                          () => sendUserLink(projectRef, "magiclink", user.email ?? ""),
                          "Magic link sent.",
                        )
                      }
                    >
                      <IconMail className="size-4" />
                      Send magic link
                    </Button>
                  }
                />
                {/* Measured, and it stays on the actions that send: nine of these went out in a row
                    without a refusal, so nothing upstream is protecting anyone from a slip here. */}
                <p className="px-4 py-3 text-xs text-subtle">{MAIL_QUOTA_NOTE}</p>
              </section>

              <section className="space-y-2">
                <div>
                  <h3 className="text-sm text-foreground">Danger zone</h3>
                  <p className="text-xs text-muted-foreground">
                    Be wary of the following features as they cannot be undone.
                  </p>
                </div>

                <div className="divide-y divide-border rounded-lg border border-destructive/40">
                  <ActionRow
                    title="Remove MFA factors"
                    // Shown always, disabled when there is nothing to remove: `/factors` answers
                    // `[]` for most users, and a control that vanishes teaches nobody what it does.
                    description={
                      factors.length === 0
                        ? "This user has no verification methods enrolled"
                        : "Removes all MFA factors associated with the user"
                    }
                    button={
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || factors.length === 0}
                        onClick={() =>
                          run(
                            async () => {
                              for (const factor of factors) {
                                const answer = await removeUserFactor(projectRef, user.id, factor.id);
                                if (!answer.ok) return answer;
                              }
                              return { ok: true } as const;
                            },
                            "Factors removed.",
                          )
                        }
                      >
                        Remove MFA factors
                      </Button>
                    }
                  />
                  <ActionRow
                    title={banned ? "Lift the ban" : "Ban user"}
                    description={
                      banned
                        ? "Restore this user's access to the project"
                        : "Revoke access to the project for a set duration"
                    }
                    button={
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
                    }
                  />
                  <ActionRow
                    title="Delete user"
                    description="User will no longer have access to the project"
                    button={
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => setDeleteOpen(true)}
                      >
                        Delete user
                      </Button>
                    }
                  />
                </div>

                {error ? <p className="text-sm text-destructive">{error}</p> : null}
              </section>
            </TabsContent>

            {/* Mounted only while selected, which is what keeps the logs endpoint out of the
                request the panel makes when it opens. */}
            <TabsContent value="logs" className="px-6 pb-10">
              <UserLogs projectRef={projectRef} userId={user.id} />
            </TabsContent>

            <TabsContent value="raw" className="px-6 pb-10">
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

/** A thing you can do, beside the sentence that says what doing it means. */
function ActionRow({
  title,
  description,
  button,
}: {
  title: string;
  description: string;
  button: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="space-y-0.5">
        <div className="text-sm text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {button}
    </div>
  );
}
