"use client";

import type { ServiceHealth } from "@/lib/mgmt-api";
import { ServiceStatus } from "@/components/status";
import { Skeleton } from "@/components/ui/skeleton";
import { isWaiting, reasonOf, useProjectPart } from "@/components/use-project-part";

/**
 * Which services the project reports as healthy.
 *
 * The old page used `safe()` here, so an empty list and a failed call printed the same sentence —
 * "the project may be paused" — whether or not anything had been asked. The refusal now carries
 * what the API said, and "nothing came back" stays a separate answer.
 */
export function DatabaseServices({ projectRef }: { projectRef: string }) {
  const health = useProjectPart<ServiceHealth[]>(projectRef, "health");

  return (
    <section className="space-y-2">
      <h2 className="text-sm text-muted-foreground">Services</h2>

      {isWaiting(health) ? (
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      ) : health.status !== "ready" ? (
        // The paused hint stays: it is the most common reason this call fails, and the API's own
        // sentence rarely says so.
        <p className="text-sm text-subtle">
          {reasonOf(health)} The project may be paused.
        </p>
      ) : !Array.isArray(health.data) || health.data.length === 0 ? (
        <p className="text-sm text-subtle">Health unavailable — the project may be paused.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {health.data.map((service) => (
            <ServiceStatus key={service.name} service={service} />
          ))}
        </div>
      )}
    </section>
  );
}
