import type { StorageConfig } from "./mgmt-api";

/** The units the original's size field offers. Bytes is the API's unit and nobody's reading unit. */
export const SIZE_UNITS = ["bytes", "KB", "MB", "GB"] as const;
export type SizeUnit = (typeof SIZE_UNITS)[number];

const FACTOR: Record<SizeUnit, number> = {
  bytes: 1,
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
};

export const isSizeUnit = (value: unknown): value is SizeUnit =>
  (SIZE_UNITS as readonly unknown[]).includes(value);

export const toBytes = (value: number, unit: SizeUnit) => Math.round(value * FACTOR[unit]);

/**
 * Bytes as a number and the largest unit that divides it evenly.
 *
 * Exact rather than pretty: 52428800 is "50 MB", but 52428801 stays in bytes rather than rounding
 * to 50 MB and writing back a different limit than the project has. This field decides what uploads
 * a project accepts, and a value that changes by being looked at is worse than an ugly one.
 *
 * A missing limit reads as zero bytes rather than the string "undefined": `call()` returns whatever
 * the body held, and a field this form writes back must never be filled from a value nobody sent.
 */
export function fromBytes(bytes: number | undefined): { value: number; unit: SizeUnit } {
  if (!Number.isFinite(bytes) || !bytes || bytes < 0) return { value: 0, unit: "bytes" };

  for (const unit of ["GB", "MB", "KB"] as const) {
    if (bytes >= FACTOR[unit] && bytes % FACTOR[unit] === 0) {
      return { value: bytes / FACTOR[unit], unit };
    }
  }

  return { value: bytes, unit: "bytes" };
}

/**
 * Whether a typed size can be written as-is.
 *
 * Whole numbers only, and at least one of whatever unit is selected. `toBytes` rounds, so "0.4" in
 * bytes would be saved as 0 and "0.0001 KB" as 0 — the field would show one limit and the project
 * would get another. What a `fileSizeLimit` of 0 means to Supabase is unmeasured, which is its own
 * reason not to send one by accident.
 */
export const sizeProblem = (value: number, unit: SizeUnit): string | null => {
  if (!Number.isFinite(value)) return "That is not a size.";
  if (!Number.isInteger(value)) return `Whole ${unit} only.`;
  if (value < 1) return "The limit must be at least 1.";
  return null;
};

/**
 * The S3 endpoint for a project.
 *
 * Derived rather than fetched: nothing in the Management API returns it, and it is the project ref
 * on a fixed host. Checked against what the Supabase dashboard shows for the same project.
 *
 * Note the host: `{ref}.storage.supabase.co`, **not** the `{ref}.supabase.co` that every other
 * storage call in this app uses (`lib/storage-api.ts`). Both are right — S3 has its own hostname —
 * and the difference looks enough like a typo to be worth saying.
 */
export const s3Endpoint = (ref: string) => `https://${ref}.storage.supabase.co/storage/v1/s3`;

export type FeatureName = keyof NonNullable<StorageConfig["features"]>;

/** Absent is off, and so is a config that never arrived. */
export const featureEnabled = (config: StorageConfig | undefined, name: FeatureName) =>
  config?.features?.[name]?.enabled === true;

const flag = featureEnabled;

export const imageTransformationOn = (c: StorageConfig | undefined) => flag(c, "imageTransformation");
export const s3ProtocolOn = (c: StorageConfig | undefined) => flag(c, "s3Protocol");
export const analyticsAvailable = (c: StorageConfig | undefined) => flag(c, "icebergCatalog");
export const vectorsAvailable = (c: StorageConfig | undefined) => flag(c, "vectorBuckets");
