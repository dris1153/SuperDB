"use server";

import { resolveProject } from "./inventory";
import { AuthError, createOAuthClient, deleteOAuthClient } from "./auth-api";
import {
  clientNameProblem,
  isClientType,
  redirectUriProblem,
  type ClientType,
} from "./oauth-clients";
import { recordWrite } from "./write-audit";

export type OAuthResult =
  | { ok: true; secret?: string; clientId?: string }
  | { ok: false; reason: string };

const failed = (e: unknown) =>
  e instanceof AuthError ? e.message : "Could not reach this project's auth service.";

/**
 * A new client, and the one moment its secret exists.
 *
 * Measured: `client_secret` is in the 201 and in a single-client read, but **not** in the list.
 * This app never reads one client, so this return value is the only way the dialog can show it —
 * and it is deliberately **not** written to the audit line, which is stored in this app's database
 * and read back by anyone who can see the connection's events.
 */
export async function createClient(
  projectRef: string,
  input: { name: string; type: ClientType; redirectUris: string[] },
): Promise<OAuthResult> {
  if (typeof input !== "object" || input === null) return { ok: false, reason: "Nothing to create." };

  const nameProblem = clientNameProblem(input.name);
  if (nameProblem) return { ok: false, reason: nameProblem };

  if (!isClientType(input.type)) return { ok: false, reason: "That is not a client type." };

  const uris = Array.isArray(input.redirectUris) ? input.redirectUris.map((u) => String(u).trim()) : [];
  const uriProblem = redirectUriProblem(uris);
  if (uriProblem) return { ok: false, reason: uriProblem };

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  try {
    const client = await createOAuthClient(projectRef, {
      client_name: input.name.trim(),
      client_type: input.type,
      redirect_uris: uris,
    });

    await recordWrite({
      ref: projectRef,
      what: "OAuth client",
      outcome: `created ${input.name.trim()} (${client.client_id})`,
    });

    return { ok: true, secret: client.client_secret, clientId: client.client_id };
  } catch (e) {
    await recordWrite({
      ref: projectRef,
      what: "OAuth client",
      outcome: `create failed: ${failed(e).slice(0, 200)}`,
    });
    return { ok: false, reason: failed(e) };
  }
}

/**
 * Removing one, which answers 204.
 *
 * The id is not a UUID in any promised sense — it is whatever the server issued — so it is length
 * checked and refused if it could travel up a path rather than name a client.
 */
export async function removeClient(projectRef: string, clientId: string): Promise<OAuthResult> {
  if (typeof clientId !== "string" || clientId === "" || clientId.length > 200) {
    return { ok: false, reason: "That is not a client." };
  }
  if (clientId.includes("/") || clientId.includes("..")) {
    return { ok: false, reason: "That is not a client." };
  }

  const found = await resolveProject(projectRef);
  if (!found) return { ok: false, reason: "Project not found." };

  try {
    await deleteOAuthClient(projectRef, clientId);
    await recordWrite({ ref: projectRef, what: "OAuth client", outcome: `deleted ${clientId}` });
    return { ok: true };
  } catch (e) {
    await recordWrite({
      ref: projectRef,
      what: "OAuth client",
      outcome: `delete failed: ${failed(e).slice(0, 200)}`,
    });
    return { ok: false, reason: failed(e) };
  }
}
