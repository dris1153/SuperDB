"use client";

import { useEffect, useMemo } from "react";
import { IconTable, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useSession, writeSession } from "./session-store";
import { useTableUrl } from "./url";

type Tab = { schema: string; table: string };

const key = (ref: string) => `superdb:tabs:${ref}`;
const same = (a: Tab, b: Tab) => a.schema === b.schema && a.table === b.table;

const EMPTY: Tab[] = [];

function parseTabs(raw: string): Tab[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return EMPTY;
  return parsed.filter(
    (t): t is Tab =>
      typeof t === "object" &&
      t !== null &&
      typeof (t as Tab).schema === "string" &&
      typeof (t as Tab).table === "string",
  );
}

/**
 * Open tables, kept in sessionStorage per project.
 *
 * The list is a working-session convenience, not addressable state — the URL owns which table is
 * active, this owns which ones are open.
 *
 * Which tabs to *show* is derived during render: whatever is stored, plus the table the URL says is
 * active. Persisting it is a separate effect that only writes to the store — no `setState`, which is
 * what an effect is actually for.
 */
export function TabBar({
  projectRef,
  schema,
  table,
}: {
  projectRef: string;
  schema: string;
  table: string | null;
}) {
  const { set } = useTableUrl();
  const storageKey = key(projectRef);
  const stored = useSession(storageKey, EMPTY, parseTabs);

  const tabs = useMemo(() => {
    if (!table) return stored;
    const active = { schema, table };
    return stored.some((t) => same(t, active)) ? stored : [...stored, active];
  }, [stored, schema, table]);

  useEffect(() => {
    if (tabs !== stored) writeSession(storageKey, JSON.stringify(tabs));
  }, [tabs, stored, storageKey]);

  const close = (tab: Tab) => {
    const index = tabs.findIndex((t) => same(t, tab));
    const next = tabs.filter((t) => !same(t, tab));
    writeSession(storageKey, JSON.stringify(next));
    // Closing the active tab has to move the URL too, or the render-time union puts it straight back.
    if (table && same(tab, { schema, table })) {
      const neighbour = next[index] ?? next[index - 1] ?? null;
      set(
        neighbour
          ? { schema: neighbour.schema, table: neighbour.table, page: "1", sort: null, filter: [], q: null }
          : { table: null },
      );
    }
  };

  if (tabs.length === 0) return null;

  return (
    <div className="flex shrink-0 items-stretch overflow-x-auto border-b border-border scrollbar-none">
      {tabs.map((t) => {
        const active = table === t.table && schema === t.schema;
        return (
          <div
            key={`${t.schema}.${t.table}`}
            className={cn(
              "group flex items-center gap-1.5 border-r border-border pr-1.5 pl-3 text-xs",
              active ? "bg-card text-foreground" : "text-subtle hover:bg-muted",
            )}
          >
            <button
              onClick={() =>
                set({ schema: t.schema, table: t.table, page: "1", sort: null, filter: [], q: null })
              }
              className="flex items-center gap-1.5 py-2"
            >
              <IconTable size={13} stroke={1.5} className="shrink-0" />
              <span className="max-w-40 truncate">{t.table}</span>
            </button>
            <button
              onClick={() => close(t)}
              aria-label={`Close ${t.table}`}
              className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-border"
            >
              <IconX size={12} stroke={1.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
