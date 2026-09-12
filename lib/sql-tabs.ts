/**
 * The SQL editor's tab arithmetic, as pure functions.
 *
 * The storage side lives in `components/sql-editor/tabs.ts`; everything that can be got wrong
 * without a browser is here, where `pnpm test` can reach it — parsing a store someone may have
 * edited by hand, choosing which tab to activate after a close, and deciding which tabs hold
 * unsaved work.
 *
 * Dirtiness is derived, never stored: a tab is dirty when its buffer differs from the text of the
 * query it holds. A flag would read false for everything after a reload, which is exactly when the
 * question matters most.
 */

export type SqlTab = {
  id: string;
  /** The saved query this tab holds, or null for a buffer that has never been saved. */
  queryId: string | null;
};

export type TabsState = { tabs: SqlTab[]; activeId: string };

/** The state a project starts in. Ids are per project, so the caller supplies the first one. */
export const firstState = (id: string): TabsState => ({ tabs: [{ id, queryId: null }], activeId: id });

/**
 * Never throws and never returns something the UI cannot render: at least one tab, and an `activeId`
 * that names one of them. `fallbackId` is used only when nothing survives parsing.
 */
export function parseTabs(raw: string, fallbackId: string): TabsState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return firstState(fallbackId);
  }
  if (typeof parsed !== "object" || parsed === null) return firstState(fallbackId);

  const { tabs, activeId } = parsed as Partial<TabsState>;
  const seen = new Set<string>();
  const clean = (Array.isArray(tabs) ? tabs : []).filter((t): t is SqlTab => {
    if (typeof t !== "object" || t === null) return false;
    const { id, queryId } = t as SqlTab;
    // Ids address a buffer key and a React key. A duplicate would give two tabs one buffer, and
    // closing either would take both.
    if (typeof id !== "string" || id === "" || seen.has(id)) return false;
    if (queryId !== null && typeof queryId !== "string") return false;
    seen.add(id);
    return true;
  });

  if (clean.length === 0) return firstState(fallbackId);
  return {
    tabs: clean,
    activeId: clean.some((t) => t.id === activeId) ? (activeId as string) : clean[0].id,
  };
}

/** The active tab, resolved against a possibly stale `activeId`. */
export const activeTabOf = (state: TabsState): SqlTab =>
  state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0];

/**
 * Closing a tab. The neighbour on the right inherits focus, then the one on the left; closing the
 * last tab leaves a fresh empty one, since no tab at all is not a state with a buffer to type into.
 */
export function closeTab(state: TabsState, id: string, freshId: string): TabsState {
  const index = state.tabs.findIndex((t) => t.id === id);
  if (index < 0) return state;

  const rest = state.tabs.filter((t) => t.id !== id);
  if (rest.length === 0) return firstState(freshId);

  const active = activeTabOf(state).id;
  return { tabs: rest, activeId: active === id ? (rest[index] ?? rest[rest.length - 1]).id : active };
}

/**
 * Which tabs hold unsaved work, plus a signature of that answer.
 *
 * The signature is what lets `useSyncExternalStore` hand React the same Set reference when nothing
 * has changed — it covers the ids, their order and their flags, so equal signatures mean an equal
 * answer.
 */
export function dirtyTabs(
  tabs: SqlTab[],
  bufferOf: (tabId: string) => string,
  savedSqlOf: (queryId: string) => string | undefined,
): { signature: string; ids: Set<string> } {
  let signature = "";
  const ids = new Set<string>();

  for (const tab of tabs) {
    // A tab whose saved query is gone — deleted, or beyond the list's limit — compares against
    // nothing, so a buffer with text in it reads as unsaved. Which it is: nothing here can confirm
    // otherwise.
    const saved = tab.queryId === null ? "" : (savedSqlOf(tab.queryId) ?? "");
    const dirty = bufferOf(tab.id) !== saved;
    signature += `${tab.id}:${dirty ? 1 : 0};`;
    if (dirty) ids.add(tab.id);
  }

  return { signature, ids };
}
