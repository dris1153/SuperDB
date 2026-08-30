import "server-only";
import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ConnectionEvent =
  | "connected"
  | "refreshed"
  | "refresh_failed"
  | "disconnected"
  /** A write against a user's own database, recorded with its real affected-row count. */
  | "wrote";

/** Proxy-supplied, so spoofable — good enough to correlate events, not to identify anyone. */
async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  } catch {
    return null;
  }
}

/**
 * Never throws. An audit write failing must not take down the operation it is recording — a lost log
 * line is bad, a connect that fails because logging failed is worse.
 */
export async function recordEvent(
  supabase: SupabaseClient,
  entry: {
    userId?: string;
    connectionId?: string | null;
    owner?: string | null;
    kind?: string | null;
    event: ConnectionEvent;
    detail?: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("connection_events").insert({
      ...(entry.userId ? { user_id: entry.userId } : {}),
      connection_id: entry.connectionId ?? null,
      owner: entry.owner ?? null,
      kind: entry.kind ?? null,
      event: entry.event,
      detail: entry.detail?.slice(0, 500) ?? null,
      ip: await clientIp(),
    });
  } catch {
    // swallowed on purpose — see the note above
  }
}
