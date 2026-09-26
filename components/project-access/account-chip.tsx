"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { usePrefetchPart } from "@/components/use-project-part";
import { ChipButton } from "./chip-button";

const load = () => import("./access-popover");

// A chunk that fails to load (a deploy since this page opened) must not take the layout down with it.
const AccessPopover = lazy(() =>
  load().catch(() => ({
    default: ({ account }: { projectRef: string; account: string }) => <ChipButton account={account} disabled title="Reload the page to open this" />,
  })),
);

/**
 * The topbar's way into the access panel. The popover is not in the route's first load — the topbar
 * is on every project page, and a menu here once cost 52KB — but it and its data are fetched once
 * the page is idle, so the first click opens on an answer instead of a chunk load and a round trip.
 */
export function AccountChip({ projectRef, account }: { projectRef: string; account: string }) {
  const [armed, setArmed] = useState(false);
  const prefetch = usePrefetchPart(projectRef, "access");

  useEffect(() => {
    const warm = () => {
      load().catch(() => {});
      void prefetch();
    };
    // Safari has no requestIdleCallback.
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 1500);
    return () => window.clearTimeout(id);
    // Once per project: the layout, and this chip with it, remounts only when the ref changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRef]);

  if (!armed) return <ChipButton account={account} onClick={() => setArmed(true)} />;
  return (
    <Suspense fallback={<ChipButton account={account} disabled />}>
      <AccessPopover projectRef={projectRef} account={account} />
    </Suspense>
  );
}
