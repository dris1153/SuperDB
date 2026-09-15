"use client";

import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Part } from "@/lib/project-part-names";

/**
 * One part of a project, fetched from `/api/projects/[ref]/[part]`.
 *
 * The endpoint answers three different things and a card has to tell them apart:
 *
 * - **ready** — it worked.
 * - **refused** — the upstream declined and said why. A missing OAuth scope is the common one, and
 *   the project page prints that sentence today rather than showing an empty card. It arrives as
 *   data, not as an error, because it is an answer.
 * - **failed** — the session expired, the network went, something threw. Worth retrying.
 *
 * The part name is typed against the same list the route handler validates, so a typo is a compile
 * error rather than a 404 nobody notices until the card stays empty.
 */
export type PartState<T> =
  /** Not asked for yet — a part that needs a table, before one is chosen. Not the same as waiting. */
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ready"; data: T }
  | { status: "refused"; reason: string }
  | { status: "failed"; reason: string };

type Body = { ok: true; data: unknown } | { ok: false; reason: string };

/**
 * Parameters as the URL carries them. `filter` repeats — a table can have several — so a flat record
 * would silently keep one of them.
 */
export type PartParams = Record<string, string> | URLSearchParams;

const queryOf = (params?: PartParams) => (params ? new URLSearchParams(params).toString() : null);

/** A refusal is data; anything else is thrown so the query retries and reports it. */
async function fetchPart(ref: string, part: Part, params?: PartParams): Promise<Body> {
  const query = params ? `?${queryOf(params)}` : "";
  const response = await fetch(`/api/projects/${ref}/${part}${query}`, {
    headers: { Accept: "application/json" },
  });

  // Every refusal from this API is JSON, including the proxy's. A body that is not JSON means
  // something upstream of the handler answered — worth saying plainly rather than letting
  // `response.json()` throw a syntax error about a page nobody asked for.
  const body: unknown = await response.json().catch(() => null);
  if (body === null || typeof body !== "object" || !("ok" in body)) {
    throw new Error(`Unexpected response (${response.status})`);
  }

  const parsed = body as Body;
  if (!response.ok) throw new Error(parsed.ok ? `Request failed (${response.status})` : parsed.reason);
  return parsed;
}

export function useProjectPart<T>(
  ref: string,
  part: Part,
  /**
   * Part of the key, so a different page or sort is a different query rather than a refetch of the
   * same one. `undefined` disables the query: a part that needs a table cannot be asked for before
   * one is chosen.
   */
  params?: PartParams,
  options?: { enabled?: boolean; keepPrevious?: boolean },
): PartState<T> {
  const key = queryOf(params);
  const enabled = options?.enabled ?? true;
  const { data, error } = useQuery({
    queryKey: ["project", ref, part, key],
    queryFn: () => fetchPart(ref, part, params),
    enabled,
    // Keep the last answer on screen while a new key is in flight. Without it, every sort, page and
    // filter drops the grid to "no data" for the length of a round trip, which reads as an error.
    placeholderData: options?.keepPrevious ? keepPreviousData : undefined,
  });

  // A disabled query stays `pending` for ever in TanStack v5, which is indistinguishable from slow
  // — and made the sidebar dim permanently whenever a part was switched off.
  if (!enabled) return { status: "idle" };

  // Data before error, deliberately. A background refetch that fails leaves the previous answer in
  // the cache and sets the error — reading the error first would replace a list that is still
  // perfectly good with "could not be read", every time the network blinked.
  if (data) {
    return data.ok ? { status: "ready", data: data.data as T } : { status: "refused", reason: data.reason };
  }
  if (error) return { status: "failed", reason: error.message || "Request failed" };
  return { status: "pending" };
}

/**
 * Writes an answer the caller already has into the cache.
 *
 * The saved-query mutations return the fresh list, so refetching it would be asking the server to
 * repeat what it just said. The cache holds the response envelope, which is why this wraps rather
 * than storing the list bare.
 */
export function useSetPart<T>(ref: string, part: Part, params?: PartParams) {
  const client = useQueryClient();
  const queryKey = ["project", ref, part, queryOf(params)];

  return async (data: T) => {
    // Cancel first: a refetch already in flight resolves *after* this write and would put the
    // pre-mutation list back. `setQueryData` refreshes `dataUpdatedAt`, so nothing would correct it
    // for a full stale window — the star you just clicked would quietly un-star itself.
    await client.cancelQueries({ queryKey });
    client.setQueryData(queryKey, { ok: true, data });
  };
}

/** For when the server says the caller's copy is out of date; the next read is the only fix. */
export function useRefetchPart(ref: string, part: Part, params?: PartParams) {
  const client = useQueryClient();
  const queryKey = ["project", ref, part, queryOf(params)];
  return () => client.invalidateQueries({ queryKey });
}

/** The reason a part has no data, when there is one. Pending and idle have none — they are not answers. */
export const reasonOf = (state: PartState<unknown>): string | null =>
  state.status === "refused" || state.status === "failed"
    ? // Never the empty string: callers branch on this, and a falsy reason reads as "no reason",
      // which is how "could not be read" turns into "nothing here".
      state.reason || "Unavailable right now."
    : null;

/** Waiting, in either of its two forms: not asked yet, or asked and not back. */
export const isWaiting = (state: PartState<unknown>) =>
  state.status === "pending" || state.status === "idle";
