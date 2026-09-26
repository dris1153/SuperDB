"use client";

import type { ProjectAccess } from "@/lib/project-access";
import { useProjectPart, useRefetchPart } from "@/components/use-project-part";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { AccessPanel } from "./access-panel";
import { ChipButton } from "./chip-button";

/** Loaded on the chip's first click: Radix's popper and the vault code stay off every first load. */
export default function AccessPopover({ projectRef, account }: { projectRef: string; account: string }) {
  const refetch = useRefetchPart(projectRef, "access");
  return (
    // Asked again on every open: sign-in details edited elsewhere must not wait out a stale copy.
    <Popover defaultOpen onOpenChange={(open) => open && refetch()}>
      <PopoverTrigger asChild>
        <ChipButton account={account} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[26rem] max-w-[calc(100vw-2rem)] p-4">
        <Content projectRef={projectRef} />
      </PopoverContent>
    </Popover>
  );
}

function Content({ projectRef }: { projectRef: string }) {
  const access = useProjectPart<ProjectAccess>(projectRef, "access");
  if (access.status === "ready") return <AccessPanel projectRef={projectRef} access={access.data} />;
  if (access.status === "pending" || access.status === "idle") {
    return <div className="space-y-2"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>;
  }
  return <p className="text-sm text-muted-foreground">The account behind this project could not be read. Reload and try again.</p>;
}
