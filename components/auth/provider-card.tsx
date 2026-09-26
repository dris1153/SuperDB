"use client";

import { IconCircleCheck } from "@tabler/icons-react";
import { timestamp } from "@/lib/format";
import { providerName, providersOf, type AuthUser } from "@/lib/auth-users";
import { Badge } from "@/components/ui/badge";
import { ProviderIcon } from "./provider-icon";

/**
 * How this person signs in.
 *
 * Built from `identities`, which is **null in a listing and filled only by a single read** —
 * measured. The panel fetches the user again for exactly this block; a project with no identities
 * on the record still shows its providers, because `app_metadata.providers` survives either way.
 *
 * The original carries a "Configure {provider} provider" button here. It is not copied: it leads to
 * a providers page this app does not have, and a button that goes nowhere is worse than no button.
 */
export function ProviderCard({ user }: { user: AuthUser }) {
  const identities = Array.isArray(user.identities) ? user.identities : [];

  const rows =
    identities.length > 0
      ? identities.map((identity, i) => ({
          key: identity.identity_id ?? `${identity.provider}-${i}`,
          provider: identity.provider ?? "unknown",
          id: identity.identity_id ?? null,
          at: identity.last_sign_in_at ?? null,
        }))
      : providersOf(user).map((provider) => ({ key: provider, provider, id: null, at: null }));

  if (rows.length === 0) {
    return <p className="text-sm text-subtle">No linked identity.</p>;
  }

  return (
    <div className="space-y-2">
      {rows.map(({ key, provider, id, at }) => (
        <div key={key} className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <ProviderIcon provider={provider} className="mt-0.5 size-5" />
              <div className="space-y-0.5">
                <div className="text-sm text-foreground">{providerName(provider)}</div>
                <div className="text-xs text-muted-foreground">
                  {describe(provider)}
                </div>
              </div>
            </div>

            <Badge variant="outline" className="gap-1 text-[10px] whitespace-nowrap">
              <IconCircleCheck className="size-3 text-emerald-500" />
              Enabled
            </Badge>
          </div>

          {id ? <div className="truncate font-mono text-xs text-subtle">{id}</div> : null}
          {at ? (
            <div className="text-xs text-subtle">Last signed in with it {timestamp(at)}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** The sentence the original prints under the provider's name. */
function describe(provider: string): string {
  if (provider === "email") return "Signed in with an email address and password";
  if (provider === "phone") return "Signed in with a phone number";
  if (provider === "anonymous") return "Signed in anonymously";
  if (provider.startsWith("sso")) return "Signed in through single sign-on";
  return `Signed in with a ${providerName(provider)} account via OAuth`;
}
