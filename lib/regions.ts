/**
 * Supabase region codes to the labels their dashboard shows, plus an ISO country code for the flag.
 *
 * Static, so it drifts as regions are added — every lookup falls back to the raw code rather than
 * showing nothing, and a missing country simply renders no flag.
 */
const REGIONS: Record<string, { label: string; country: string }> = {
  "us-east-1": { label: "East US (North Virginia)", country: "US" },
  "us-east-2": { label: "East US (Ohio)", country: "US" },
  "us-west-1": { label: "West US (North California)", country: "US" },
  "us-west-2": { label: "West US (Oregon)", country: "US" },
  "ca-central-1": { label: "Canada (Central)", country: "CA" },
  "sa-east-1": { label: "South America (São Paulo)", country: "BR" },
  "eu-west-1": { label: "West EU (Ireland)", country: "IE" },
  "eu-west-2": { label: "West EU (London)", country: "GB" },
  "eu-west-3": { label: "West EU (Paris)", country: "FR" },
  "eu-central-1": { label: "Central EU (Frankfurt)", country: "DE" },
  "eu-central-2": { label: "Central EU (Zurich)", country: "CH" },
  "eu-north-1": { label: "North EU (Stockholm)", country: "SE" },
  "ap-south-1": { label: "South Asia (Mumbai)", country: "IN" },
  "ap-southeast-1": { label: "Southeast Asia (Singapore)", country: "SG" },
  "ap-northeast-1": { label: "Northeast Asia (Tokyo)", country: "JP" },
  "ap-northeast-2": { label: "Northeast Asia (Seoul)", country: "KR" },
  "ap-southeast-2": { label: "Oceania (Sydney)", country: "AU" },
  "ap-east-1": { label: "Southeast Asia (Hong Kong)", country: "HK" },
};

export const regionLabel = (code: string) => REGIONS[code]?.label ?? code;
export const regionCountry = (code: string) => REGIONS[code]?.country ?? null;

/**
 * Compute size for the tile. A project with no compute_instance addon is on the free default, which
 * the dashboard labels NANO.
 */
export function computeLabel(addons: { type: string; variant: { id: string; name: string } }[]): string {
  const compute = addons.find((a) => a.type === "compute_instance");
  if (!compute) return "NANO";
  return (compute.variant.name || compute.variant.id.replace(/^ci_/, "")).toUpperCase();
}

/** The dashboard's own wording — "Healthy" rather than the raw ACTIVE_HEALTHY. */
const STATUS_LABELS: Record<string, string> = {
  ACTIVE_HEALTHY: "Healthy",
  ACTIVE_UNHEALTHY: "Unhealthy",
  INACTIVE: "Paused",
  COMING_UP: "Coming up",
  GOING_DOWN: "Going down",
  PAUSING: "Pausing",
  RESTORING: "Restoring",
  RESTARTING: "Restarting",
  UPGRADING: "Upgrading",
  RESIZING: "Resizing",
  INIT_FAILED: "Init failed",
  RESTORE_FAILED: "Restore failed",
  PAUSE_FAILED: "Pause failed",
  REMOVED: "Removed",
  UNKNOWN: "Unknown",
};

export const statusLabel = (status: string) =>
  STATUS_LABELS[status] ?? status.toLowerCase().replace(/_/g, " ");
