"use client";

import { IconDots, IconHelpCircle, IconKey, IconLock, IconUsers } from "@tabler/icons-react";
import { timeAgo } from "@/lib/format";
import {
  algorithmHint,
  describeAlgorithm,
  isSymmetric,
  statusBadge,
  type SigningKeyRow,
} from "@/lib/signing-keys";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/ui/empty-state";
import { PILL } from "@/components/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One table of signing keys, in the shape the Supabase dashboard uses.
 *
 * The status column carries the distinction the headings used to: a current key and a standby sit in
 * the same table and are told apart by their badge, which is how the original reads.
 */
export function SigningKeyTable({
  keys,
  empty,
  timeColumn,
  actions,
}: {
  keys: SigningKeyRow[];
  empty?: string;
  /**
   * The header for the timestamp column, and the column itself when it is given.
   *
   * A label rather than a flag: `updated_at` is when a key last changed status, which on the retired
   * table is the rotation and on the revoked table is the revocation. Calling both "Last rotated at"
   * would name the wrong event on half of them.
   */
  timeColumn?: string;
  actions: (key: SigningKeyRow) => React.ReactNode;
}) {
  if (keys.length === 0) return empty ? <Empty>{empty}</Empty> : null;

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <Column>Status</Column>
            <Column>Key ID</Column>
            <Column>Type</Column>
            {timeColumn ? <Column>{timeColumn}</Column> : null}
            <Column className="text-right">Actions</Column>
          </TableRow>
        </TableHeader>

        <TableBody>
          {keys.map((key) => (
            <TableRow key={key.id}>
              <TableCell>
                <StatusPill status={key.status} />
              </TableCell>

              <TableCell>
                <code className="rounded-md border border-border px-2 py-1 font-mono text-xs tracking-wide text-foreground">
                  {key.id}
                </code>
              </TableCell>

              <TableCell>
                <KeyType algorithm={key.algorithm} />
              </TableCell>

              {timeColumn ? (
                <TableCell className="text-xs text-subtle">{timeAgo(key.updated_at)}</TableCell>
              ) : null}

              <TableCell className="text-right">{actions(key)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The type, with an icon for what kind of key it is.
 *
 * A padlock for a key with a public half, a group for a shared secret — not an open padlock, which
 * would read as "less secure". HS256 is not weaker, it is shared, and that is the thing that decides
 * what revoking it does.
 */
function KeyType({ algorithm }: { algorithm: string }) {
  const Icon = isSymmetric(algorithm) ? IconUsers : IconLock;

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon size={13} stroke={1.5} className="shrink-0 text-subtle" />
      {describeAlgorithm(algorithm)}
      <Tooltip>
        <TooltipTrigger className="cursor-help text-subtle">
          <IconHelpCircle size={13} stroke={1.5} />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{algorithmHint(algorithm)}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function Column({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TableHead className={cn("text-[11px] tracking-wider text-subtle uppercase", className)}>
      {children}
    </TableHead>
  );
}

// The same four tones `components/status.tsx` uses for projects and services, so a key that is
// healthy, transitional or withdrawn reads the same here as everywhere else in the app.
const TONES = {
  current: "border-brand-border text-primary",
  standby: "text-muted-foreground",
  previous: "border-warn/40 text-warn",
  revoked: "border-destructive/40 text-destructive",
} as const;

function StatusPill({ status }: { status: string }) {
  const { label, tone } = statusBadge(status);

  return (
    <Badge variant="outline" className={cn(PILL, "tracking-wide whitespace-nowrap", TONES[tone])}>
      <IconKey size={11} stroke={1.5} />
      {label}
    </Badge>
  );
}

/** The kebab. Rendered for every row, so a row with only "Copy key ID" still has one. */
export function KeyMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label}>
          <IconDots size={14} stroke={1.5} />
        </Button>
      </DropdownMenuTrigger>
      {/* Without a width this sizes to the trigger, which is a 28px icon button — long labels wrap. */}
      <DropdownMenuContent align="end" className="w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

