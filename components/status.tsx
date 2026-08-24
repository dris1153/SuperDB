import { Badge } from "./ui";
import type { Project, ServiceHealth } from "@/lib/mgmt-api";

const PROJECT_TONE: Record<string, "brand" | "neutral" | "warn" | "danger"> = {
  ACTIVE_HEALTHY: "brand",
  INACTIVE: "neutral",
  REMOVED: "neutral",
  ACTIVE_UNHEALTHY: "danger",
  INIT_FAILED: "danger",
  RESTORE_FAILED: "danger",
  PAUSE_FAILED: "danger",
};

/** Anything mid-transition (COMING_UP, PAUSING, RESIZING, …) falls through to warn. */
export function ProjectStatus({ status }: { status: Project["status"] }) {
  return (
    <Badge tone={PROJECT_TONE[status] ?? "warn"}>
      {status.toLowerCase().replace(/_/g, " ")}
    </Badge>
  );
}

export function ServiceStatus({ service }: { service: ServiceHealth }) {
  const tone = service.status === "ACTIVE_HEALTHY" ? "brand" : service.status === "UNHEALTHY" ? "danger" : "warn";
  return (
    <Badge tone={tone} className="font-mono">
      {service.name}
    </Badge>
  );
}
