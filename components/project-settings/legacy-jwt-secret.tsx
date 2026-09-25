"use client";

import Link from "next/link";
import { date } from "@/lib/format";
import type { SigningKeyRow } from "@/lib/signing-keys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty-state";

/**
 * The HS256 secret this project's JWTs used to be signed with.
 *
 * **Its value cannot be shown here, and that is the honest part of this tab.** Supabase's own
 * dashboard has a Reveal control; nothing in the Management API is behind it. Measured 2026-09-25:
 * `/config/auth/signing-keys/legacy` answers with the same six metadata fields as any other key and
 * `public_jwk` is null for a symmetric one, while `/config/auth` has no `jwt_secret` field at all.
 * A disabled Reveal button would be worse than none — it would imply the value is one permission
 * away.
 *
 * Which key is "the legacy secret" is taken as any HS256 key in the list rather than from
 * `/signing-keys/legacy`, to avoid a second request for something already on screen. HS256 is in the
 * create enum, so in principle a project could hold one that is not the original; in practice the
 * only HS256 key is the one Supabase made.
 */
export function LegacyJwtSecret({
  projectRef,
  keys,
  busy,
  onRevoke,
}: {
  projectRef: string;
  keys: SigningKeyRow[];
  busy: boolean;
  onRevoke: (key: SigningKeyRow) => void;
}) {
  if (keys.length === 0) {
    return (
      <Empty>
        This project has no legacy JWT secret.
        <span className="mt-1 block text-xs">
          Projects created since late 2025 sign with an asymmetric key from the start.
        </span>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      {keys.map((key) => (
        <Card key={key.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge variant="outline">{key.algorithm}</Badge>
            <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {key.id}
            </code>
            <span className="text-xs text-subtle">{describeStatus(key.status)}</span>
            <span className="text-xs text-subtle">Created {date(key.created_at)}</span>
          </div>

          <p className="text-xs text-subtle">
            The secret itself is not readable through the Management API, so this page cannot show
            it. Open{" "}
            <Link
              href={`https://supabase.com/dashboard/project/${projectRef}`}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-2"
            >
              this project in the Supabase dashboard
            </Link>{" "}
            and look under JWT Keys if you need the value.
          </p>

          {key.status === "previously_used" ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-warn">
                Still verifying <span className="font-mono">anon</span> and{" "}
                <span className="font-mono">service_role</span>, which are tokens signed by this
                key.
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => onRevoke(key)}
                className="border-destructive/40 text-destructive"
              >
                Revoke
              </Button>
            </div>
          ) : null}

          <p className="text-xs text-subtle">
            Whether this project still issues those two keys is a separate switch, on{" "}
            <Link
              href={`/p/${projectRef}/settings/api-keys`}
              className="text-foreground underline underline-offset-2"
            >
              API Keys
            </Link>
            .
          </p>
        </Card>
      ))}
    </div>
  );
}

/** The status verbatim if it is one the API has never returned: `call()` only casts over JSON. */
const describeStatus = (status: SigningKeyRow["status"]): string =>
  ({
    in_use: "Still signing new tokens",
    standby: "Prepared, signing nothing",
    previously_used: "Retired, still verifying",
    revoked: "Withdrawn, verifying nothing",
  })[status] ?? status;
