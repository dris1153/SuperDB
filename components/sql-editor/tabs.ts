"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";
import type { SavedQuery } from "@/lib/saved-queries";
import {
  activeTabOf,
  closeTab,
  dirtyTabs,
  firstState,
  parseTabs,
  type SqlTab,
  type TabsState,
} from "@/lib/sql-tabs";
import {
  clearSession,
  readSession,
  sessionKeys,
  subscribeSession,
  useSession,
  writeSession,
} from "@/components/table-editor/session-store";

/**
 * Where the tabs and their buffers are kept.
 *
 * Three state systems meet on this page and the boundaries are the whole design: the database owns
 * what is *saved*, `sessionStorage` owns which tabs are *open* and what is in their buffers, and
 * nothing owns dirtiness — `lib/sql-tabs.ts` derives it, and holds every part of this that can be
 * tested without a browser.
 *
 * `session-store.ts` is the table editor's, reused rather than reimplemented. Its subtle part is
 * that `sessionStorage` fires no event in the tab that wrote it, so writes notify subscribers
 * themselves; a second implementation would look fine until two components shared a key.
 *
 * **Every key carries the project ref.** `sessionStorage` is per browser tab, not per route, so a
 * buffer key without the ref is shared by every project in that browser tab — one project's unsaved
 * statement would appear in another's editor, one click from Run.
 */

export type { SqlTab };

const tabsKey = (ref: string) => `superdb:sql-tabs:${ref}`;
const bufferPrefix = (ref: string) => `superdb:sql-buffer:${ref}:`;
const bufferKey = (ref: string, tabId: string) => `${bufferPrefix(ref)}${tabId}`;

const EMPTY_BUFFER = "";
const identity = (raw: string) => raw;

/** `randomUUID` needs a secure context, and this dashboard is reachable over plain HTTP on a LAN. */
const newId = () =>
  `t${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10)}`;

/**
 * The fallback must be a stable reference: `useSession` uses it as the server snapshot too, and a
 * fresh object per render would make every render a change. Keyed by ref so the first tab of one
 * project is not the first tab of another.
 */
const firsts = new Map<string, TabsState>();
function firstFor(ref: string): TabsState {
  const existing = firsts.get(ref);
  if (existing) return existing;
  const state = firstState("t1");
  firsts.set(ref, state);
  return state;
}

/** The active tab's text. Read through the store so a reload starts where the typing stopped. */
export const useBuffer = (ref: string, tabId: string) =>
  useSession(bufferKey(ref, tabId), EMPTY_BUFFER, identity);

/**
 * Written on every keystroke, undebounced. A statement is kilobytes and `sessionStorage` writes are
 * synchronous — measure before adding a timer, which would also have to be flushed on switch and on
 * close to be correct.
 */
export const writeBuffer = (ref: string, tabId: string, sql: string) =>
  writeSession(bufferKey(ref, tabId), sql);

export function useSqlTabs(projectRef: string) {
  const first = firstFor(projectRef);
  const parse = useCallback((raw: string) => parseTabs(raw, first.tabs[0].id), [first]);
  const state = useSession(tabsKey(projectRef), first, parse);

  /**
   * Mutations read the store back rather than closing over the rendered value. Two clicks in one
   * tick would otherwise both write from the same stale list, and the second would silently undo
   * the first.
   */
  const current = (): TabsState => {
    const raw = readSession(tabsKey(projectRef));
    return raw === null ? first : parseTabs(raw, first.tabs[0].id);
  };
  const write = (next: TabsState) => writeSession(tabsKey(projectRef), JSON.stringify(next));

  return {
    tabs: state.tabs,
    activeId: activeTabOf(state).id,
    activate: (id: string) => write({ ...current(), activeId: id }),

    /** One tab per saved query: opening one already open activates it instead of duplicating it. */
    open: (queryId: string, sql: string) => {
      const now = current();
      const existing = now.tabs.find((t) => t.queryId === queryId);
      if (existing) return write({ ...now, activeId: existing.id });

      const id = newId();
      writeBuffer(projectRef, id, sql);
      write({ tabs: [...now.tabs, { id, queryId }], activeId: id });
    },

    add: () => {
      const id = newId();
      writeBuffer(projectRef, id, EMPTY_BUFFER);
      const now = current();
      write({ tabs: [...now.tabs, { id, queryId: null }], activeId: id });
    },

    /** After Save as…, so the tab stops being an unsaved buffer without being reopened. */
    link: (tabId: string, queryId: string) => {
      const now = current();
      write({ ...now, tabs: now.tabs.map((t) => (t.id === tabId ? { ...t, queryId } : t)) });
    },

    close: (id: string) => {
      const now = current();
      const next = closeTab(now, id, newId());
      if (next === now) return;

      // The buffer goes with the tab, and the sweep catches keys left behind by a close that never
      // reached the list — the stale-key filtering `column-prefs.ts` does for column names.
      const live = new Set(next.tabs.map((t) => t.id));
      const prefix = bufferPrefix(projectRef);
      for (const key of sessionKeys(prefix)) {
        if (!live.has(key.slice(prefix.length))) clearSession(key);
      }
      write(next);
    },
  };
}

/**
 * Which tabs hold unsaved work, for the dots in the tab bar and the warning before a close.
 *
 * One subscription over several keys, which no single `useSession` call can express — hence the
 * store exporting its own subscribe. The cache is per hook instance: a module-level one would
 * thrash between two mounted workspaces, hand React a new Set every call, and loop forever.
 */
const NONE: ReadonlySet<string> = new Set();
/** Not a signature anything can produce: a real one is a sequence of `id:flag;` groups, or empty. */
const NO_SIGNATURE = "unset";

export function useDirtyTabs(ref: string, tabs: SqlTab[], queries: SavedQuery[]): ReadonlySet<string> {
  const cache = useRef<{ signature: string; ids: ReadonlySet<string> }>({
    signature: NO_SIGNATURE,
    ids: NONE,
  });

  const get = useCallback(() => {
    const { signature, ids } = dirtyTabs(
      tabs,
      (tabId) => readSession(bufferKey(ref, tabId)) ?? EMPTY_BUFFER,
      (queryId) => queries.find((q) => q.id === queryId)?.sql,
    );
    if (signature !== cache.current.signature) cache.current = { signature, ids };
    return cache.current.ids;
  }, [ref, tabs, queries]);

  const getServer = useCallback(() => NONE, []);
  return useSyncExternalStore(subscribeSession, get, getServer);
}
