import { Badge } from "./ui/badge";
import { cn } from "@/lib/utils";
import type { Project, ServiceHealth } from "@/lib/mgmt-api";

// shadcn's Badge has no outline-plus-tone variant, so the tone rides in via className. Pill radius
// comes from DESIGN.md ("tags: 9999px").
export const PILL = "rounded-full";

const PROJECT_TONE: Record<string, string> = {
  ACTIVE_HEALTHY: "border-brand-border text-primary",
  INACTIVE: "text-muted-foreground",
  REMOVED: "text-muted-foreground",
  ACTIVE_UNHEALTHY: "border-destructive/40 text-destructive",
  INIT_FAILED: "border-destructive/40 text-destructive",
  RESTORE_FAILED: "border-destructive/40 text-destructive",
  PAUSE_FAILED: "border-destructive/40 text-destructive",
};

/** Anything mid-transition (COMING_UP, PAUSING, RESIZING, …) falls through to the warning tone. */
export function ProjectStatus({ status }: { status: Project["status"] }) {
  return (
    <Badge variant="outline" className={cn(PILL, PROJECT_TONE[status] ?? "border-warn/40 text-warn")}>
      {status.toLowerCase().replace(/_/g, " ")}
    </Badge>
  );
}

export function ServiceStatus({ service }: { service: ServiceHealth }) {
  const tone =
    service.status === "ACTIVE_HEALTHY"
      ? "border-brand-border text-primary"
      : service.status === "UNHEALTHY"
        ? "border-destructive/40 text-destructive"
        : "border-warn/40 text-warn";

  return (
    <Badge variant="outline" className={cn(PILL, "font-mono", tone)}>
      {service.name}
    </Badge>
  );
}
