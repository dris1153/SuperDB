"use client";

import type { PoolerConfig } from "@/lib/mgmt-api";
import { GetConnected } from "@/components/get-connected";
import { useProjectPart } from "@/components/use-project-part";

/**
 * "Get connected", waiting on the pooler configuration for two of its five tabs.
 *
 * The tiles render immediately — they are the same five whatever the answer is — and the connection
 * strings arrive with the query. The sheet is told whether a missing string is still in flight or
 * genuinely unavailable: "this project does not offer it" is a claim, and making it while the
 * request is still going is the kind of confident wrong answer this page keeps avoiding.
 */
export function ConnectPanel({
  projectRef,
  dbHost,
  secret,
}: {
  projectRef: string;
  dbHost: string | null;
  /** The vault blob holding this project's database password, or null when none is stored. */
  secret: string | null;
}) {
  const pooler = useProjectPart<PoolerConfig[]>(projectRef, "pooler");
  const config = pooler.status === "ready" ? pooler.data : null;

  const primary = config?.find((p) => p.database_type === "PRIMARY") ?? config?.[0];
  const transactionPooler =
    config?.find((p) => p.pool_mode === "transaction")?.connection_string ??
    primary?.connection_string ??
    null;

  // Supabase returns no session-mode row; its own dashboard derives the string by swapping the
  // transaction pooler port. Looking for pool_mode "session" matched nothing, which is why the
  // Direct tab reported it unavailable.
  const sessionPooler = transactionPooler?.replace(":6543", ":5432") ?? null;

  return (
    <GetConnected
      info={{
        projectRef,
        projectUrl: `https://${projectRef}.supabase.co`,
        dbHost,
        transactionPooler,
        sessionPooler,
        // So the sheet can say "still loading" instead of "this project does not offer it".
        poolerPending: pooler.status === "pending",
        poolerReason: pooler.status === "refused" || pooler.status === "failed" ? pooler.reason : null,
        secret,
      }}
    />
  );
}
