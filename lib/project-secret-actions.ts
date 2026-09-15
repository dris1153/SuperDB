"use server";

import { saveProjectSecret } from "./project-secrets";

export type SecretResult = { ok: true } | { ok: false; reason: string };

/**
 * The browser-facing half of `project-secrets.ts`, which is `server-only` and deliberately not a
 * `"use server"` module — every export of one of those is an action any signed-in browser can call.
 *
 * **Storing and clearing are two functions on purpose.** `saveConnectionSecret` takes an optional
 * blob where `undefined` means "leave the stored one alone", and its own comment explains at length
 * why writing a null there would destroy a password irreversibly. That affordance does not exist on
 * `saveProjectSecret`, and an optional argument here would make the difference between "save this",
 * "leave it" and "delete it" depend on whether a value happened to be `undefined` — which is exactly
 * what `seal()` returns when the vault has locked. Two names, no ambiguity.
 */
export async function saveDatabasePassword(ref: string, blob: string): Promise<SecretResult> {
  // Not a type guard for the compiler's benefit: this is an endpoint, and `blob` arrives from the
  // network. An empty string would encrypt to nothing and read back as "no password stored".
  if (typeof blob !== "string" || blob === "") {
    return { ok: false, reason: "Nothing to save." };
  }

  try {
    await saveProjectSecret(ref, blob);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not save." };
  }
}

/** Deleting is its own call, so it can never be reached by an argument that was merely missing. */
export async function clearDatabasePassword(ref: string): Promise<SecretResult> {
  try {
    await saveProjectSecret(ref, null);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Could not clear." };
  }
}
