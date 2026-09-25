"use client";

import { useState } from "react";
import { avatarOf, initialsOf, type AuthUser } from "@/lib/auth-users";

/**
 * The picture a provider gave, or the initials of whatever the row does have.
 *
 * **A plain `img`, not `next/image`.** These are arbitrary third-party hosts — the measured user's
 * is `avatars.githubusercontent.com` — and routing them through the optimizer would put this app's
 * server in front of every one of them and need each host allow-listed in `next.config.ts` to load
 * at all.
 *
 * `referrerPolicy="no-referrer"` because the host does not need to be told which page is looking,
 * and the row never waits on the image: a failure falls straight back to initials.
 */
export function UserAvatar({ user }: { user: AuthUser }) {
  const [broken, setBroken] = useState(false);
  const src = avatarOf(user);

  if (!src || broken) {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
        {initialsOf(user)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={28}
      height={28}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
      className="size-7 shrink-0 rounded-full object-cover"
    />
  );
}
