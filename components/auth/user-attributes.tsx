"use client";

import { IconCircleX } from "@tabler/icons-react";
import { timestamp } from "@/lib/format";
import type { AuthUser } from "@/lib/auth-users";

/**
 * The eight rows the original's Overview tab opens with: label left, value right, a rule between.
 *
 * **A dash is an answer here, not a gap.** `invited_at` is null on somebody who signed up rather
 * than being invited, and `confirmation_sent_at` is null on somebody confirmed at creation — both
 * are facts about the account. `email_confirmed_at` goes further and is *absent* rather than null on
 * a user created with `email_confirm: false`, which is why every row reads through the same
 * formatter instead of testing for null itself.
 */
export function UserAttributes({ user }: { user: AuthUser }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "User UID", value: <span className="font-mono text-xs">{user.id}</span> },
    { label: "Created at", value: timestamp(user.created_at) },
    { label: "Updated at", value: timestamp(user.updated_at) },
    { label: "Invited at", value: timestamp(user.invited_at) },
    { label: "Confirmation sent at", value: timestamp(user.confirmation_sent_at) },
    { label: "Confirmed at", value: timestamp(user.email_confirmed_at) },
    { label: "Last signed in", value: timestamp(user.last_sign_in_at) },
    {
      label: "SSO",
      value: user.is_sso_user ? (
        "Yes"
      ) : (
        <IconCircleX className="ml-auto size-4 text-subtle" aria-label="No" />
      ),
    },
  ];

  return (
    <dl className="divide-y divide-border border-y border-border">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between gap-4 px-1 py-2.5 text-sm">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="truncate text-right font-mono text-xs text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
