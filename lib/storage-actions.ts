"use server";

import { resolveProject } from "./inventory";
import { updateStorageConfig } from "./mgmt-api";
import { attempt } from "./safe";
import { isSizeUnit, sizeProblem, toBytes, type SizeUnit } from "./storage-config";
import { recordWrite } from "./write-audit";

export type ConfigResult = { ok: true } | { ok: false; reason: string };

/**
 * Writing the two storage settings.
 *
 * **The caller sends a size and two flags, not a `features` object.** This module is `"use server"`,
 * so every export is an endpoint any signed-in browser can call with any payload; accepting a raw
 * `features` would let it name features this app does not show. The body is built here, from three
 * values that are each checked here.
 *
 * Measured 2026-09-25: `PATCH` merges at the top level and within `features`, so omitting a feature
 * leaves it alone. Sending a feature sub-object, though, means sending *all* of its fields —
 * `icebergCatalog` and `vectorBuckets` carry `max*` limits and a partial one is refused with a 400
 * naming the missing field. `imageTransformation` has only `enabled`, which is why it is safe to
 * send alone.
 */
export async function saveStorageConfig(
  projectRef: string,
  settings: {
    size?: { value: number; unit: SizeUnit };
    imageTransformation?: boolean;
    s3Protocol?: boolean;
  },
): Promise<ConfigResult> {
  // Shape-checked, not trusted. A `"use server"` export is an endpoint and the types are erased, so
  // `settings` can be anything at all — including `null`, which would throw out of the action as an
  // opaque digest rather than come back as a result.
  if (typeof settings !== "object" || settings === null) return { ok: false, reason: "Nothing to save." };

  const { size, imageTransformation, s3Protocol } = settings as Record<string, unknown>;

  if (imageTransformation !== undefined && typeof imageTransformation !== "boolean") {
    return { ok: false, reason: "That setting is on or off." };
  }

  if (s3Protocol !== undefined && typeof s3Protocol !== "boolean") {
    return { ok: false, reason: "That setting is on or off." };
  }

  const body: {
    fileSizeLimit?: number;
    features?: {
      imageTransformation?: { enabled: boolean };
      s3Protocol?: { enabled: boolean };
    };
  } = {};

  if (size !== undefined) {
    if (typeof size !== "object" || size === null) return { ok: false, reason: "That is not a size." };

    const { value, unit } = size as Record<string, unknown>;
    // The unit is checked, not just used. `sizeProblem` only ever reads it to build a message, so
    // an unknown one passed validation and `toBytes` returned NaN — which serialises to
    // `"fileSizeLimit": null` and goes on the wire, and what that does to a project's upload limit
    // is unmeasured.
    if (!isSizeUnit(unit)) return { ok: false, reason: "That is not a size." };

    const problem = sizeProblem(value as number, unit);
    if (problem) return { ok: false, reason: problem };

    body.fileSizeLimit = toBytes(value as number, unit);
  }

  // Only the features that changed. `features` merges by key upstream, so an untouched one is
  // better left unsent — and both of these carry nothing but `enabled`, which is why they are safe
  // to send alone. `icebergCatalog` and `vectorBuckets` also carry `max*` limits and would be
  // refused without them, so nothing here toggles those.
  if (imageTransformation !== undefined) {
    body.features = { imageTransformation: { enabled: imageTransformation } };
  }

  if (s3Protocol !== undefined) {
    body.features = { ...body.features, s3Protocol: { enabled: s3Protocol } };
  }

  if (body.fileSizeLimit === undefined && !body.features) return { ok: true };

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => updateStorageConfig(found.token, projectRef, body));

  await recordWrite({
    ref: projectRef,
    what: "storage config",
    outcome: result.ok
      ? `saved ${JSON.stringify(body).slice(0, 150)}`
      : `save failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
