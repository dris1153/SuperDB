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

/**
 * Where values go when `sessionStorage` is unavailable — private browsing, blocked site data, some
 * webviews. It used to be acceptable to drop those writes: the store held view preferences. It now
 * holds the SQL editor's unsaved buffers, and silently dropping one means an editor that rolls back
 * to nothing on the next tab switch, or a Run button that never enables. Memory-only lasts as long
 * as the page rather than the browser tab, which is a degradation rather than a data loss.
 */
const memory = new Map<string, string>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * For a view that depends on several keys at once and cannot be expressed as one `useSession` call.
 * Exported so such a view shares this listener set rather than starting a second one — the reason
 * this module exists is that `sessionStorage` notifies nobody in the tab that wrote it.
 */
export const subscribeSession = subscribe;

/** A raw read, for the same case. Keeps every `sessionStorage` access in this module. */
export function readSession(key: string): string | null {
  try {
    const stored = sessionStorage.getItem(key);
    if (stored !== null) return stored;
  } catch {
    // Unavailable; the in-memory copy is all there is.
  }
  return memory.get(key) ?? null;
}

/** Every stored key under a prefix, so a caller can sweep the ones nothing refers to any more. */
export function sessionKeys(prefix: string): string[] {
  const found = new Set<string>();
  try {
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(prefix)) found.add(key);
    }
  } catch {
    // Unavailable; the in-memory copy is all there is.
  }
  for (const key of memory.keys()) if (key.startsWith(prefix)) found.add(key);
  return [...found];
}

function snapshot<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  const raw = readSession(key);

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

/** Removing a key is a write like any other: the same cache invalidation, the same notification. */
export function clearSession(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Same as a failed write: the store is simply not available.
  }
  memory.delete(key);
  cache.delete(key);
  for (const listener of listeners) listener();
}

export function writeSession(key: string, raw: string) {
  memory.set(key, raw);
  try {
    sessionStorage.setItem(key, raw);
  } catch {
    // Quota, or no storage at all. The in-memory copy above is what readers will find.
  }
  // Notify regardless: the in-memory cache is invalidated by the raw string changing, and a failed
  // write should still leave every subscriber agreeing on what the store now says.
  cache.delete(key);
  for (const listener of listeners) listener();
}
