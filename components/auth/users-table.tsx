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
 *
 * **The page owns its height**, in the shape `components/table-editor/editor.tsx` has used since it
 * was built: title, toolbar and footer are fixed strips, and only the grid scrolls — which is what
 * puts the horizontal scrollbar at the bottom of the window rather than under the table. `min-h-0`
 * on that region is what lets it shrink; without it a flex child refuses to, and the page grows
 * taller instead of scrolling inside itself.
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
  const reset =
    <T,>(set: (next: T) => void) =>
    (next: T) => {
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
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-8 py-4">
        <h1 className="text-base text-foreground">Users</h1>
        {/* Up here rather than under the table: it answers "how many are there", which is a question
            about the page, and at the bottom it only arrived after scrolling past the answer. */}
        <span className="text-sm text-muted-foreground">{data ? userCount(data.total) : ""}</span>
      </header>

      <div className="shrink-0 border-b border-border px-8 py-3.5">
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
      </div>

      {selected.length > 0 ? (
        <div className="shrink-0 border-b border-border px-8 py-2.5">
          <BulkDeleteBar
            projectRef={projectRef}
            selected={selected}
            labels={labels}
            onClear={() => setSelected([])}
            onDone={() => void refetch()}
          />
        </div>
      ) : null}

      {/* The only region that scrolls. Sideways as well as down, which is what keeps the toolbar
          and the footer still while eight columns move under them. */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isWaiting(state) ? (
          <div className="space-y-2 px-8 py-6">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : state.status !== "ready" ? (
          <div className="px-8 py-6">
            <Empty>{reasonOf(state)}</Empty>
          </div>
        ) : users.length === 0 ? (
          <div className="px-8 py-6">
            <Empty>
              {filter
                ? field === "id"
                  ? `No user with the UID “${filter}”.`
                  : `No users match “${filter}”.`
                : "This project has no users yet."}
            </Empty>
          </div>
        ) : (
          // The rule under the last row. `TableBody` carries `[&_tr:last-child]:border-0`, and
          // fighting that from the same element would tie on specificity and leave the stylesheet's
          // order to decide — so the line goes on the table itself, where nothing contests it.
          <Table className="border-b border-border">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {/* `pr-3!`, not `pr-3`: `ui/table.tsx` zeroes the right padding of any cell holding
                    a checkbox through a `:has()` selector, so the checkbox sat against the avatar.
                    Matching that selector would only tie on specificity and leave source order to
                    decide; `!` decides it. Same answer as the sheet's `sm:max-w-4xl!`. */}
                <TableHead className="w-10 pl-4 pr-3!">
                  <Checkbox
                    checked={allShown}
                    aria-label="Select every user on this page"
                    onCheckedChange={(next) =>
                      setSelected(next === true ? users.map((u) => u.id) : [])
                    }
                  />
                </TableHead>
                {/* No rule between these two: the original reads a checkbox and a face as one
                    region before the UID, and a line there marks a column that does not exist. */}
                <TableHead className="w-12 border-r border-border/60" />
                {columns.map((label) => (
                  <Head key={label}>{label}</Head>
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
                  <TableCell className="pl-4 pr-3!" onClick={(e) => e.stopPropagation()}>
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

                  <TableCell className="border-r border-border/60">
                    <UserAvatar user={user} />
                  </TableCell>

                  {shows("uid") ? <Mono>{user.id}</Mono> : null}
                  {shows("name") ? <Cell>{displayNameOf(user)}</Cell> : null}

                  {shows("email") ? (
                    <Cell>
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
                    </Cell>
                  ) : null}

                  {shows("phone") ? <Cell>{user.phone}</Cell> : null}

                  {shows("providers") ? (
                    <Cell>
                      <span className="flex flex-wrap items-center gap-3">
                        {providersOf(user).map((provider) => (
                          <Provider key={provider} provider={provider} />
                        ))}
                      </span>
                    </Cell>
                  ) : null}

                  {shows("providerType") ? <Cell>{providerTypeOf(user)}</Cell> : null}
                  {shows("created") ? <Cell>{timestamp(user.created_at)}</Cell> : null}
                  {shows("lastSignIn") ? <Cell>{timestamp(user.last_sign_in_at)}</Cell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-end border-t border-border px-8 py-2 text-sm text-muted-foreground">
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
      </footer>

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
        // The row it was opened from: six of the values the panel shows are already here, and a
        // skeleton over them would hide data the browser is holding for the length of a read.
        seed={users.find((u) => u.id === openUser) ?? null}
        onClose={() => setOpenUser(null)}
        // A ban or a delete changes the row this page is showing, and only this page can refetch it.
        onChanged={() => void refetch()}
      />
    </div>
  );
}

/** Column rules live on the cells rather than on the table, so two of them can go without one. */
const Head = ({ children }: { children: React.ReactNode }) => (
  <TableHead className="border-r border-border/60 text-xs font-normal whitespace-nowrap text-muted-foreground last:border-r-0">
    {children}
  </TableHead>
);

const Cell = ({ children }: { children: React.ReactNode }) => (
  <TableCell className="border-r border-border/60 text-sm whitespace-nowrap last:border-r-0">
    {children || "-"}
  </TableCell>
);

const Mono = ({ children }: { children: React.ReactNode }) => (
  <TableCell className="border-r border-border/60 font-mono text-xs whitespace-nowrap last:border-r-0">
    {children}
  </TableCell>
);
