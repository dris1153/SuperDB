"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { toast } from "sonner";
import { timestamp } from "@/lib/format";
import {
  displayNameOf,
  isBanned,
  pageCount,
  providersOf,
  providerTypeOf,
  userCount,
  type AuthUser,
  type UserSort,
} from "@/lib/auth-users";
import { createProjectUser, sendUserLink } from "@/lib/auth-user-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { isWaiting, reasonOf, useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { useUserColumns } from "./column-picker";
import { BulkDeleteBar } from "./bulk-delete";
import { Provider } from "./provider-icon";
import { UserAvatar } from "./user-avatar";
import { UsersToolbar, type SearchField } from "./users-toolbar";
import { CreateUserDialog } from "./user-dialogs";
import { UserPanel } from "./user-panel";

type UserPage = { users: AuthUser[]; total: number | null; hasNext: boolean };

/**
 * A project's users, one server-filtered page at a time.
 *
 * **Everything the toolbar does happens upstream.** The search is `?filter=`, a substring match that
 * narrows `x-total-count`; the sort is `sort=created_at asc`, the only column the API will order by;
 * and looking up a UID is a read of that one user rather than a search for text shaped like an id.
 * Filtering or sorting in the browser would be right for one page and wrong for the second.
 */
export function UsersTable({ projectRef }: { projectRef: string }) {
  const [field, setField] = useState<SearchField>("filter");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<UserSort>("created_at desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const { hidden, toggle, shows } = useUserColumns(projectRef);

  // Deferred rather than sent per keystroke, the way the file browser searches Storage.
  const filter = useDeferredValue(search.trim());

  const params = useMemo(
    () => ({
      page: String(page),
      sort,
      ...(filter ? { filter } : {}),
      ...(field === "id" ? { by: "id" } : {}),
    }),
    [page, sort, filter, field],
  );

  const state = useProjectPart<UserPage>(projectRef, "auth-users", params, { keepPrevious: true });
  const refetch = useRefetchPart(projectRef, "auth-users", params);
  const data = state.status === "ready" ? state.data : null;
  // Memoised because `?? []` is a new array on every render, and the label map below is keyed on it.
  const users = useMemo(() => data?.users ?? [], [data]);

  // Tracked here rather than read off the query: with `keepPrevious` the hook stays `ready` through
  // a refetch, so `status` never says a refresh is in flight and the button would never indicate.
  const [refreshing, setRefreshing] = useState(false);

  const refresh = () => {
    setRefreshing(true);
    void refetch().finally(() => setRefreshing(false));
  };

  const [openUser, setOpenUser] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"create" | "invite">("create");
  const [createError, setCreateError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  // A selection outlives nothing: the rows it names are not on screen after a page, a filter or a
  // sort changes, and a delete then acts on accounts nobody is looking at.
  const reset = <T,>(set: (next: T) => void) => (next: T) => {
    set(next);
    setSelected([]);
    setPage(1);
  };

  const labels = useMemo(
    () => new Map(users.map((u) => [u.id, u.email ?? u.phone ?? u.id])),
    [users],
  );

  const allShown = users.length > 0 && users.every((u) => selected.includes(u.id));

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

  const columns = [
    shows("uid") && "UID",
    shows("name") && "Display name",
    shows("email") && "Email",
    shows("phone") && "Phone",
    shows("providers") && "Providers",
    shows("providerType") && "Provider type",
    shows("created") && "Created at",
    shows("lastSignIn") && "Last sign in at",
  ].filter((c): c is string => typeof c === "string");

  return (
    <section className="space-y-4">
      <UsersToolbar
        field={field}
        onField={reset(setField)}
        search={search}
        onSearch={reset(setSearch)}
        sort={sort}
        onSort={reset(setSort)}
        hidden={hidden}
        toggle={toggle}
        onRefresh={refresh}
        refreshing={refreshing}
        onCreate={() => {
          setCreateMode("create");
          setCreateOpen(true);
        }}
        onInvite={() => {
          setCreateMode("invite");
          setCreateOpen(true);
        }}
      />

      <BulkDeleteBar
        projectRef={projectRef}
        selected={selected}
        labels={labels}
        onClear={() => setSelected([])}
        onDone={() => void refetch()}
      />

      {isWaiting(state) ? (
        <TableSkeleton />
      ) : state.status !== "ready" ? (
        <Empty>{reasonOf(state)}</Empty>
      ) : users.length === 0 ? (
        <Empty>
          {filter
            ? field === "id"
              ? `No user with the UID “${filter}”.`
              : `No users match “${filter}”.`
            : "This project has no users yet."}
        </Empty>
      ) : (
        // Overflowing rather than truncating: the original shows every column in full and scrolls
        // sideways, which is what a UID and a full timestamp need.
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table className="[&_td]:border-r [&_td]:border-border/60 [&_td:last-child]:border-r-0 [&_th]:border-r [&_th]:border-border/60 [&_th:last-child]:border-r-0">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allShown}
                    aria-label="Select every user on this page"
                    onCheckedChange={(next) =>
                      setSelected(next === true ? users.map((u) => u.id) : [])
                    }
                  />
                </TableHead>
                <TableHead className="w-12" />
                {columns.map((label) => (
                  <TableHead key={label} className="text-xs font-normal whitespace-nowrap text-muted-foreground">
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>

            <TableBody>
              {users.map((user) => (
                <TableRow
                  key={user.id}
                  onClick={() => setOpenUser(user.id)}
                  className="cursor-pointer"
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.includes(user.id)}
                      aria-label={`Select ${labels.get(user.id)}`}
                      onCheckedChange={(next) =>
                        setSelected((current) =>
                          next === true
                            ? [...current, user.id]
                            : current.filter((id) => id !== user.id),
                        )
                      }
                    />
                  </TableCell>

                  <TableCell>
                    <UserAvatar user={user} />
                  </TableCell>

                  {shows("uid") ? <Mono>{user.id}</Mono> : null}
                  {shows("name") ? <Cell>{displayNameOf(user)}</Cell> : null}

                  {shows("email") ? (
                    <TableCell className="text-sm whitespace-nowrap">
                      <span className="flex items-center gap-2">
                        {user.email ?? "-"}
                        {/* Two states the row would otherwise hide: never confirmed, and banned
                            right now rather than once banned. */}
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
                      <span className="flex flex-wrap items-center gap-3">
                        {providersOf(user).map((provider) => (
                          <Provider key={provider} provider={provider} />
                        ))}
                      </span>
                    </TableCell>
                  ) : null}

                  {shows("providerType") ? <Cell>{providerTypeOf(user)}</Cell> : null}
                  {shows("created") ? <Cell>{timestamp(user.created_at)}</Cell> : null}
                  {shows("lastSignIn") ? <Cell>{timestamp(user.last_sign_in_at)}</Cell> : null}
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
            onClick={() => {
              setSelected([]);
              setPage((p) => Math.max(1, p - 1));
            }}
          >
            <IconChevronLeft className="size-4" />
          </Button>
          {/* `hasNext` comes from the `link` header rather than from arithmetic on the total: the
              API decides whether there is another page, and it is the one counting. */}
          <Button
            variant="outline"
            size="sm"
            disabled={!data?.hasNext}
            onClick={() => {
              setSelected([]);
              setPage((p) => p + 1);
            }}
          >
            <IconChevronRight className="size-4" />
          </Button>
        </span>
      </div>

      <CreateUserDialog
        open={createOpen}
        mode={createMode}
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

const Cell = ({ children }: { children: React.ReactNode }) => (
  <TableCell className="text-sm whitespace-nowrap">{children || "-"}</TableCell>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <TableCell className="font-mono text-xs whitespace-nowrap">{children}</TableCell>
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
