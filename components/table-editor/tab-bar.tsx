"use client";

import { useEffect, useState } from "react";
import { IconTable, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useTableUrl } from "./url";

type Tab = { schema: string; table: string };

const key = (ref: string) => `superdb:tabs:${ref}`;
const same = (a: Tab, b: Tab) => a.schema === b.schema && a.table === b.table;

/**
 * Open tables, kept in sessionStorage per project.
 *
 * The list is a working-session convenience, not addressable state — the URL owns which table is
 * active, this owns which ones are open. Every storage call is guarded because private browsing and
 * blocked site data throw on access, exactly as `lib/vault-store.ts` documents.
 */
const read = (ref: string): Tab[] => {
  try {
    const raw = sessionStorage.getItem(key(ref));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is Tab =>
        typeof t === "object" && t !== null && typeof (t as Tab).table === "string",
    );
  } catch {
    return [];
  }
};

const write = (ref: string, tabs: Tab[]) => {
  try {
    sessionStorage.setItem(key(ref), JSON.stringify(tabs));
  } catch {
    // Session-only is an acceptable degradation; losing the tab list is not worth an error.
  }
};

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
  const [tabs, setTabs] = useState<Tab[]>([]);

  // Storage is only readable in the browser, so the first paint is server-rendered without tabs.
  useEffect(() => {
    setTabs(read(projectRef));
  }, [projectRef]);

  useEffect(() => {
    if (!table) return;
    setTabs((current) => {
      const active = { schema, table };
      if (current.some((t) => same(t, active))) return current;
      const next = [...current, active];
      write(projectRef, next);
      return next;
    });
  }, [projectRef, schema, table]);

  const close = (tab: Tab) => {
    const index = tabs.findIndex((t) => same(t, tab));
    const next = tabs.filter((t) => !same(t, tab));
    setTabs(next);
    write(projectRef, next);
    if (table && same(tab, { schema, table })) {
      const neighbour = next[index] ?? next[index - 1] ?? null;
      set(neighbour ? { schema: neighbour.schema, table: neighbour.table, page: "1", sort: null } : { table: null });
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
              onClick={() => set({ schema: t.schema, table: t.table, page: "1", sort: null })}
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
