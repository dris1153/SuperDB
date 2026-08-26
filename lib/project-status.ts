import type { Project } from "./mgmt-api";

/**
 * Read by both the page and the paused card, so it cannot live in mgmt-api: that module is
 * server-only, and a client component importing a value from it fails the build. The type import
 * above is erased, so nothing server-side comes along with it.
 */

/** Paused, or failed on the way back — both offer the same next step. */
export const isPaused = (status: Project["status"]) =>
  status === "INACTIVE" || status === "RESTORE_FAILED";

/** On its way somewhere, so the only sensible action is to wait. */
export const isMoving = (status: Project["status"]) =>
  status === "RESTORING" ||
  status === "COMING_UP" ||
  status === "PAUSING" ||
  status === "GOING_DOWN";
