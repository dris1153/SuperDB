"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Reading `sessionStorage` as what it is — an external store — instead of copying it into state
 * inside an effect.
 *
 * The effect version renders twice on every mount (once with the fallback, once with the stored
 * value) and is what `react-hooks/set-state-in-effect` objects to. `useSyncExternalStore` has a
 * server snapshot, so the server and the first client render agree and there is no second pass.
 *
 * Two things this has to get right:
 *
 * - **`sessionStorage` fires no event for the tab that wrote it.** The `storage` event is only for
 *   *other* tabs. So writes go through `writeSession`, which notifies subscribers itself.
 * - **`getSnapshot` must return a stable value.** Parsing on every call hands React a new object
 *   each time and it re-renders forever. The parsed value is cached against the raw string, so an
 *   unchanged store returns the identical reference.
 *
 * `fallback` must be a module-level constant, not an inline literal: it is also the server snapshot,
 * and a fresh object per render would defeat the same check.
 */

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    // Private browsing and blocked site data throw on access; the fallback is the whole answer.
    return fallback;
  }

  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;

  let value = fallback;
  if (raw !== null) {
    try {
      value = parse(raw);
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

export function useSession<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  const get = useCallback(() => snapshot(key, fallback, parse), [key, fallback, parse]);
  const getServer = useCallback(() => fallback, [fallback]);
  return useSyncExternalStore(subscribe, get, getServer);
}

export function writeSession(key: string, raw: string) {
  try {
    sessionStorage.setItem(key, raw);
  } catch {
    // Session-only is an acceptable degradation for a view preference.
  }
  // Notify regardless: the in-memory cache is invalidated by the raw string changing, and a failed
  // write should still leave every subscriber agreeing on what the store now says.
  cache.delete(key);
  for (const listener of listeners) listener();
}
