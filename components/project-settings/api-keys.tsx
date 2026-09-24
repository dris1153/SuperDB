"use client";

import { useState } from "react";
import type { KeyRow } from "@/lib/api-keys";
import { CopyButton } from "@/components/copy-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";
import { cn } from "@/lib/utils";

/**
 * The project's API keys, in the two tabs the Supabase dashboard uses.
 *
 * **One request, not two.** `GET /api-keys` returns every key with a `type`; the tabs are a filter
 * over that one list. `/api-keys/legacy` holds nothing but an `{enabled}` flag, which is the switch
 * in a later phase rather than a second source of keys.
 */
export function ApiKeys({ projectRef }: { projectRef: string }) {
  const keys = useProjectPart<KeyRow[]>(projectRef, "api-key-rows");
  const [tab, setTab] = useState<"current" | "legacy">("current");

  const all = keys.status === "ready" && Array.isArray(keys.data) ? keys.data : [];
  const shown = all.filter((k) => (tab === "legacy" ? k.type === "legacy" : k.type !== "legacy"));

  return (
    <section className="space-y-4">
      <div className="flex gap-4 border-b border-border">
        <Tab active={tab === "current"} onClick={() => setTab("current")}>
          Publishable and secret API keys
        </Tab>
        <Tab active={tab === "legacy"} onClick={() => setTab("legacy")}>
          Legacy anon, service_role API keys
        </Tab>
      </div>

      {isWaiting(keys) ? (
        <Card className="space-y-3 p-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </Card>
      ) : keys.status !== "ready" ? (
        <Empty>
          Could not read this project&apos;s API keys.
          <span className="mt-1 block text-xs">{reasonOf(keys)}</span>
        </Empty>
      ) : shown.length === 0 ? (
        <Empty>
          {tab === "legacy"
            ? "This project has no legacy keys. Projects created since late 2025 do not get them."
            : "No publishable or secret keys yet."}
        </Empty>
      ) : (
        <Card className="divide-y divide-border p-0">
          {shown.map((key) => (
            <Row key={key.id ?? key.name} row={key} />
          ))}
        </Card>
      )}
    </section>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-1 pb-2 text-sm transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-subtle hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * What a row may show depends entirely on the key.
 *
 * `toRow` has already decided: `value` is present for the two types meant to be public and null for
 * the two that are not. This component never sees a `service_role` or `secret` value, which is why
 * it cannot leak one by accident — the decision is upstream and tested, not repeated here.
 */
function Row({ row }: { row: KeyRow }) {
  const dangerous = row.type === "secret" || row.name === "service_role";

  return (
    <div className="flex flex-wrap items-center gap-3 p-4 sm:flex-nowrap">
      <div className="min-w-0 sm:w-56">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-foreground">{row.name}</span>
          {dangerous ? (
            <Badge variant="outline" className="border-destructive/40 text-destructive">
              secret
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-subtle">
          {row.description ?? "No description"}
        </p>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
          {row.value ?? row.prefix ?? "—"}
        </code>
        {row.value ? <CopyButton value={row.value} /> : null}
      </div>

      {row.value ? null : (
        <p className="w-full text-xs text-subtle sm:w-52">
          {row.name === "service_role"
            ? "Bypasses Row Level Security. Never put it in a browser."
            : "Only the prefix is shown here."}
        </p>
      )}
    </div>
  );
}
