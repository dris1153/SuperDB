"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { IconChevronLeft, IconChevronRight, IconSearch, IconPlus } from "@tabler/icons-react";
import { toast } from "sonner";
import { date } from "@/lib/format";
import {
  displayNameOf,
  isBanned,
  pageCount,
  providersOf,
  providerTypeOf,
  userCount,
  type AuthUser,
} from "@/lib/auth-users";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { createProjectUser, sendUserLink } from "@/lib/auth-user-actions";
import { ColumnPicker, useUserColumns } from "./column-picker";
import { CreateUserDialog } from "./user-dialogs";
import { UserPanel } from "./user-panel";

type UserPage = { users: AuthUser[]; total: number | null; hasNext: boolean };

/**
 * A project's users, one server-filtered page at a time.
 *
 * **The search is the server's.** `?filter=` is a substring match that narrows `x-total-count`;
 * filtering in the browser would mean paging every user of a large project into it first. `?email=`
 * is accepted and ignored by the API, which looks like a search that matched everything — so
 * nothing here sends it.
 */
export function UsersTable({ projectRef }: { projectRef: string }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { hidden, toggle, shows } = useUserColumns(projectRef);

  // Deferred rather than sent per keystroke, the way the file browser searches Storage.
  const filter = useDeferredValue(search.trim());

  const params = useMemo(
    () => ({ page: String(page), ...(filter ? { filter } : {}) }),
    [page, filter],
  );

  const state = useProjectPart<UserPage>(projectRef, "auth-users", params, { keepPrevious: true });
  const refetch = useRefetchPart(projectRef, "auth-users", params);
  const data = state.status === "ready" ? state.data : null;
  const users = data?.users ?? [];

  const [openUser, setOpenUser] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const add = (action: () => Promise<{ ok: boolean; reason?: string }>, done: string) =>
    start(async () => {
      setCreateError(null);
      const result = await action();

      if (!result.ok) {
        setCreateError(result.reason ?? "That did not work.");
        return;
      }

      toast.success(done);
      setCreateOpen(false);
      await refetch();
    });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              // A narrower filter has fewer pages, and page 4 of a one-page result reads as
              // "no users" rather than as a filter that matched nothing.
              setPage(1);
            }}
            placeholder="Search by email, phone or UID"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <ColumnPicker hidden={hidden} toggle={toggle} />
          <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
            <IconPlus className="size-4" />
            Add user
          </Button>
        </div>
      </div>

      {isWaiting(state) ? (
        <TableSkeleton />
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : users.length === 0 ? (
        <Empty>
          {filter ? `No users match “${filter}”.` : "This project has no users yet."}
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {shows("uid") ? <Head>UID</Head> : null}
                {shows("name") ? <Head>Display name</Head> : null}
                {shows("email") ? <Head>Email</Head> : null}
                {shows("phone") ? <Head>Phone</Head> : null}
                {shows("providers") ? <Head>Providers</Head> : null}
                {shows("providerType") ? <Head>Provider type</Head> : null}
                {shows("created") ? <Head>Created at</Head> : null}
                {shows("lastSignIn") ? <Head>Last sign in at</Head> : null}
              </TableRow>
            </TableHeader>

            <TableBody>
              {users.map((user) => (
                <TableRow
                  key={user.id}
                  onClick={() => setOpenUser(user.id)}
                  className="cursor-pointer"
                >
                  {shows("uid") ? (
                    <TableCell className="max-w-[10rem] truncate font-mono text-xs" title={user.id}>
                      {user.id}
                    </TableCell>
                  ) : null}

                  {shows("name") ? <Cell>{displayNameOf(user)}</Cell> : null}

                  {shows("email") ? (
                    <TableCell className="text-sm">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{user.email ?? "—"}</span>
                        {/* Two states the row would otherwise hide: a user who never confirmed,
                            and one who is banned right now rather than one who once was. */}
                        {user.email && !user.email_confirmed_at ? (
                          <Badge variant="outline" className="text-[10px]">
                            Unconfirmed
                          </Badge>
                        ) : null}
                        {isBanned(user) ? (
                          <Badge variant="outline" className="text-[10px] text-destructive">
                            Banned
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                  ) : null}

                  {shows("phone") ? <Cell>{user.phone}</Cell> : null}

                  {shows("providers") ? (
                    <TableCell className="text-sm">
                      <span className="flex flex-wrap gap-1">
                        {providersOf(user).map((provider) => (
                          <Badge key={provider} variant="outline" className="text-[10px]">
                            {provider}
                          </Badge>
                        ))}
                      </span>
                    </TableCell>
                  ) : null}

                  {shows("providerType") ? <Cell>{providerTypeOf(user)}</Cell> : null}
                  {shows("created") ? <Cell>{date(user.created_at)}</Cell> : null}
                  {shows("lastSignIn") ? <Cell>{date(user.last_sign_in_at)}</Cell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{data ? userCount(data.total) : ""}</span>

        <span className="flex items-center gap-2">
          <span>
            Page {page} of {pageCount(data?.total ?? null)}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <IconChevronLeft className="size-4" />
          </Button>
          {/* `hasNext` comes from the `link` header rather than from arithmetic on the total: the
              API decides whether there is another page, and it is the one counting. */}
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            <IconChevronRight className="size-4" />
          </Button>
        </span>
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        busy={busy}
        error={createError}
        onCreate={(input) => add(() => createProjectUser(projectRef, input), "User created.")}
        onInvite={(email) => add(() => sendUserLink(projectRef, "invite", email), "Invite sent.")}
      />

      <UserPanel
        projectRef={projectRef}
        userId={openUser}
        onClose={() => setOpenUser(null)}
        // A ban or a delete changes the row this page is showing, and only this page can refetch it.
        onChanged={() => void refetch()}
      />
    </section>
  );
}

const Head = ({ children }: { children: React.ReactNode }) => (
  <TableHead className="text-xs font-normal text-muted-foreground">{children}</TableHead>
);

const Cell = ({ children }: { children: React.ReactNode }) => (
  <TableCell className="text-sm">{children || "—"}</TableCell>
);

function TableSkeleton() {
  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
