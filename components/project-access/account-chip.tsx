"use client";

import { lazy, Suspense, useState } from "react";
import { ChipButton } from "./chip-button";

// A chunk that fails to load (a deploy since this page opened) must not take the layout down with it.
const AccessPopover = lazy(() =>
  import("./access-popover").catch(() => ({
    default: ({ account }: { projectRef: string; account: string }) => <ChipButton account={account} disabled title="Reload the page to open this" />,
  })),
);

/**
 * The topbar's way into the access panel. The popover and everything under it load on the first
 * click, not with the route: the topbar is on every project page, and a menu here once cost 52KB.
 */
export function AccountChip({ projectRef, account }: { projectRef: string; account: string }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return <ChipButton account={account} onPointerEnter={() => void import("./access-popover").catch(() => {})} onClick={() => setArmed(true)} />;
  }
  return (
    <Suspense fallback={<ChipButton account={account} disabled />}>
      <AccessPopover projectRef={projectRef} account={account} />
    </Suspense>
  );
}
