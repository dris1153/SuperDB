"use client";

import { IconCircleX } from "@tabler/icons-react";
import { timestamp } from "@/lib/format";
import type { AuthUser } from "@/lib/auth-users";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The eight rows the original's Overview tab opens with: label left, value right, a rule between.
 *
 * **A dash is an answer here, not a gap.** `invited_at` is null on somebody who signed up rather
 * than being invited, and `confirmation_sent_at` is null on somebody confirmed at creation — both
 * are facts about the account. `email_confirmed_at` goes further and is *absent* rather than null on
 * a user created with `email_confirm: false`, which is why every row reads through the same
 * formatter instead of testing for null itself.
 *
 * **Which is why a pending row must not show one.** Four of these exist only in the single read, and
 * until it lands the panel is rendering the row it was opened from. Printing a dash there would
 * claim the API said the field was empty; a skeleton says what is true — and when the read fails
 * outright, `unread` says the third true thing rather than leaving a skeleton spinning for ever.
 */
export function UserAttributes({
  user,
  detail,
}: {
  user: AuthUser;
  /**
   * Where the single read got to. Three states, not two: a value that is still coming, one that
   * arrived empty and one that could not be read are three different things, and only the middle
   * one is a dash.
   */
  detail: "pending" | "ready" | "failed";
}) {
  const rows: { label: string; value: React.ReactNode; late?: boolean }[] = [
    { label: "User UID", value: <span className="font-mono text-xs">{user.id}</span> },
    { label: "Created at", value: timestamp(user.created_at) },
    { label: "Updated at", value: timestamp(user.updated_at), late: true },
    { label: "Invited at", value: timestamp(user.invited_at), late: true },
    {
      label: "Confirmation sent at",
      value: timestamp(user.confirmation_sent_at),
      late: true,
    },
    { label: "Confirmed at", value: timestamp(user.email_confirmed_at) },
    { label: "Last signed in", value: timestamp(user.last_sign_in_at) },
    {
      label: "SSO",
      value: user.is_sso_user ? (
        "Yes"
      ) : (
        <IconCircleX className="ml-auto size-4 text-subtle" aria-label="No" />
      ),
      late: true,
    },
  ];

  return (
    <dl className="divide-y divide-border border-y border-border">
      {rows.map(({ label, value, late }) => (
        <div key={label} className="flex items-center justify-between gap-6 px-1 py-2.5 text-sm">
          {/* One line each: at 896px every label fits, and wrapping "User UID" was the sheet being
              384px rather than the label being long. */}
          <dt className="whitespace-nowrap text-muted-foreground">{label}</dt>
          <dd className="text-right font-mono text-xs text-foreground">
            {!late || detail === "ready" ? (
              value
            ) : detail === "pending" ? (
              <Skeleton className="ml-auto h-4 w-40" />
            ) : (
              <span className="text-subtle">unread</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
