"use server";

import { isAddressableById, isMasked, nameProblem } from "./api-keys";
import { resolveProject } from "./inventory";
import {
  createApiKey,
  deleteApiKey,
  getApiKey,
  listApiKeys,
  setLegacyKeys,
  updateApiKey,
  type ApiKey,
} from "./mgmt-api";
import { forgetProjectKey } from "./project-key";
import { recordWrite } from "./write-audit";
import { attempt, type Attempt } from "./safe";

export type RevealResult =
  | { ok: true; value: string }
  /** `permission` separates "this connection may not" from "something went wrong". */
  | { ok: false; reason: string; permission: boolean };

/** Legacy keys are not addressable by id — see `isAddressableById`, which has the measurement. */
const fetchKey = (token: string, ref: string, id: string, reveal: boolean): Promise<Attempt<ApiKey | undefined>> =>
  isAddressableById(id)
    ? attempt(() => getApiKey(token, ref, id, reveal))
    : attempt(async () => (await listApiKeys(token, ref, reveal)).find((k) => k.id === id));

/**
 * The value behind a key the list deliberately withheld.
 *
 * Fetched on demand and never with the page — the rule `getServerEnv` already states: a credential
 * loaded eagerly sits in the payload of every page view whether or not anyone asked for it. One key
 * where the API allows it, rather than the whole list, so a click on one row does not pull three
 * other credentials through this process.
 *
 * **Two attempts, because the two withheld types are withheld for different reasons.** A `secret`
 * key is masked by the API unless the token may read secrets, so it needs `reveal=true`. The legacy
 * `service_role` key is *not* masked — it comes back complete with no special permission — but the
 * list drops it anyway, because a page that renders every key by default should not render the one
 * that bypasses Row Level Security. So a refusal falls back to the plain read, and that is returned
 * only when it is genuinely unmasked.
 *
 * **Nothing here is cached, audited or logged.** `connection_events` is append-only by policy —
 * `lib/sql-redact.ts` records that it has `select` and `insert` and nothing else — so a key that
 * landed there could never be removed. Reading a key is not a write, and this leaves no trail by
 * design.
 */
export async function revealApiKey(projectRef: string, id: string): Promise<RevealResult> {
  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found.", permission: false };
  if (!id) return { ok: false, reason: "That key no longer exists.", permission: false };

  const revealed = await fetchKey(found.token, projectRef, id, true);
  if (revealed.ok && revealed.data && !isMasked(revealed.data.api_key)) {
    return { ok: true, value: revealed.data.api_key ?? "" };
  }

  // Either the token may not reveal, or it may and the API masked it anyway. The plain read tells
  // those apart without guessing — and it is the only path that works for the legacy pair.
  const plain = await fetchKey(found.token, projectRef, id, false);
  if (plain.ok && plain.data?.api_key && !isMasked(plain.data.api_key)) {
    return { ok: true, value: plain.data.api_key };
  }

  if (revealed.ok) {
    // 200, and still masked or missing. The permission is there or was never needed; the API is
    // simply not handing this one over.
    return {
      ok: false,
      reason: revealed.data
        ? "Supabase did not return this key's value. Copy it from the Supabase dashboard."
        : "That key no longer exists.",
      permission: false,
    };
  }

  const denied = revealed.status === 403 || revealed.status === 401;
  return {
    ok: false,
    reason: denied
      ? "This connection may not read secret keys. It needs a token that reaches this project and is allowed to read API key secrets."
      : revealed.reason,
    permission: denied,
  };
}


export type KeyResult = { ok: true } | { ok: false; reason: string };

/**
 * Creating a key.
 *
 * The name is checked here as well as in the form, because this module is `"use server"` — every
 * export is an endpoint any signed-in browser can call with any string. The client check is a
 * convenience; this one is the boundary. Neither is the authority: when the API disagrees with both,
 * its own message is what gets shown, since the rule is a snapshot of one day's behaviour.
 */
export async function createKey(
  projectRef: string,
  type: "publishable" | "secret",
  name: string,
  description: string,
): Promise<KeyResult> {
  const trimmed = name.trim();
  const problem = nameProblem(trimmed);
  if (problem) return { ok: false, reason: problem };

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const body = { type, name: trimmed, ...(description.trim() ? { description: description.trim() } : {}) };
  const result = await attempt(() => createApiKey(found.token, projectRef, body));
  // Storage caches one of these for a minute; the cached one may be the key just changed.
  forgetProjectKey(projectRef);

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/** `type` is not here because it cannot be changed after creation. */
export async function renameKey(
  projectRef: string,
  id: string,
  name: string,
  description: string,
): Promise<KeyResult> {
  const trimmed = name.trim();
  const problem = nameProblem(trimmed);
  if (problem) return { ok: false, reason: problem };

  if (!isAddressableById(id)) {
    // Legacy keys have no id to PATCH — theirs is their own name — and nothing about them is
    // editable anyway.
    return { ok: false, reason: "Legacy keys cannot be renamed." };
  }

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() =>
    updateApiKey(found.token, projectRef, id, { name: trimmed, description: description.trim() }),
  );
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * Deleting a key. Whatever authenticates with it stops working immediately, and there is no undo —
 * the confirm in front of this is where that is said.
 */
export async function removeKey(projectRef: string, id: string): Promise<KeyResult> {
  if (!isAddressableById(id)) return { ok: false, reason: "Legacy keys cannot be deleted here." };

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => deleteApiKey(found.token, projectRef, id));
  // Storage caches one of these for a minute; the cached one may be the key just changed.
  forgetProjectKey(projectRef);

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}


/**
 * Turning the legacy `anon` and `service_role` keys off, or back on.
 *
 * **One flag, both keys** — there is no per-key switch. `anon` is what nearly every client
 * application in the wild authenticates with, so disabling this does not degrade anything: it stops
 * those clients dead, immediately.
 *
 * **Re-enabling is one call and that is not the same as undo.** It restores the flag; it does not
 * restore the requests that failed in between, and it does not tell anyone whose application broke
 * that it is safe again. The confirm in front of this should not soften the decision by pointing at
 * how easily it reverses.
 *
 * **Not measured.** Every other claim on this page was checked against the live API; this one was
 * not, because the only way to learn what disabling does to a project is to disable it on a real
 * one. What is written here comes from the endpoint's shape and Supabase's documentation.
 */
export async function setLegacyKeysEnabled(
  projectRef: string,
  enabled: boolean,
): Promise<KeyResult> {
  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  const result = await attempt(() => setLegacyKeys(found.token, projectRef, enabled));

  // Turning the legacy pair off invalidates service_role, which is what Storage caches.
  forgetProjectKey(projectRef);

  // Audited either way, and before the outcome is returned. This is the widest-reaching switch on
  // the page, and a change nobody can find afterwards is worse than one that failed.
  await recordWrite({
    ref: projectRef,
    what: "legacy API keys",
    outcome: result.ok
      ? enabled
        ? "enabled"
        : "disabled"
      : `${enabled ? "enable" : "disable"} failed: ${result.reason.slice(0, 200)}`,
  });

  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}
