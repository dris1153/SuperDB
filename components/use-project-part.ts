"use client";

import { useQuery } from "@tanstack/react-query";
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
  | { status: "pending" }
  | { status: "ready"; data: T }
  | { status: "refused"; reason: string }
  | { status: "failed"; reason: string };

type Body = { ok: true; data: unknown } | { ok: false; reason: string };

/** A refusal is data; anything else is thrown so the query retries and reports it. */
async function fetchPart(ref: string, part: Part, params?: Record<string, string>): Promise<Body> {
  const query = params ? `?${new URLSearchParams(params)}` : "";
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
  /** Only `logs` takes any; they are part of the key, so a different interval is a different query. */
  params?: Record<string, string>,
): PartState<T> {
  const { data, error, isPending } = useQuery({
    queryKey: ["project", ref, part, params ?? null],
    queryFn: () => fetchPart(ref, part, params),
  });

  if (isPending) return { status: "pending" };
  if (error) return { status: "failed", reason: error.message };
  if (!data.ok) return { status: "refused", reason: data.reason };
  return { status: "ready", data: data.data as T };
}
