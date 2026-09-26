"use client";

import { useCallback, useSyncExternalStore } from "react";
import { IconLayoutColumns } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const USER_COLUMNS = [
  { key: "uid", label: "UID" },
  { key: "name", label: "Display name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "providers", label: "Providers" },
  { key: "providerType", label: "Provider type" },
  { key: "created", label: "Created at" },
  { key: "lastSignIn", label: "Last sign in at" },
] as const;

export type ColumnKey = (typeof USER_COLUMNS)[number]["key"];

const ALL = USER_COLUMNS.map((c) => c.key);

/**
 * Which columns are on screen, remembered per project.
 *
 * `localStorage` rather than the URL: eight columns overflow a laptop, so hiding one is a standing
 * preference rather than something worth putting in a shared link. Per project, because two
 * projects hold very different users — one with phone numbers, one without.
 *
 * Read as an external store rather than copied into state in an effect, for the reasons
 * `components/table-editor/session-store.ts` documents: an effect renders twice on every mount and
 * `getSnapshot` must return a stable reference or React re-renders for ever. That module is
 * `sessionStorage`, which is per tab — a column hidden here should still be hidden in the next one.
 */
const storageKey = (projectRef: string) => `superdb:auth-columns:${projectRef}`;

/** Also the server snapshot, so it must be one constant rather than a literal per render. */
const NONE: ColumnKey[] = [];

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: ColumnKey[] }>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Blocked site data, or a webview without storage. Every column shows.
    return null;
  }
}

function snapshot(key: string): ColumnKey[] {
  const raw = read(key);

  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;

  let value = NONE;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      value = parsed.filter((k): k is ColumnKey => (ALL as readonly string[]).includes(k));
    }
  } catch {
    // Something else wrote nonsense under this key.
  }

  cache.set(key, { raw, value });
  return value;
}

export function useUserColumns(projectRef: string) {
  const key = storageKey(projectRef);

  const hidden = useSyncExternalStore(
    useCallback((listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    }, []),
    useCallback(() => snapshot(key), [key]),
    useCallback(() => NONE, []),
  );

  const toggle = (column: ColumnKey) => {
    const next = hidden.includes(column)
      ? hidden.filter((k) => k !== column)
      : [...hidden, column];

    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // The preference lasts for this page rather than for this browser. Nothing else breaks.
    }
    // Regardless of whether the write landed: `localStorage` notifies only *other* tabs, so this
    // one hears nothing unless it says so itself.
    cache.delete(key);
    for (const listener of listeners) listener();
  };

  return { hidden, toggle, shows: (column: ColumnKey) => !hidden.includes(column) };
}

export function ColumnPicker({
  hidden,
  toggle,
}: {
  hidden: ColumnKey[];
  toggle: (key: ColumnKey) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <IconLayoutColumns className="size-4" />
          Columns
          {hidden.length > 0 ? (
            <span className="text-xs text-muted-foreground">{USER_COLUMNS.length - hidden.length}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Columns</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {USER_COLUMNS.map(({ key, label }) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={!hidden.includes(key)}
            // Radix closes on select; picking several columns in a row is the normal case here.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggle(key)}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
