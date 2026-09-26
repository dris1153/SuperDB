import type { SigningKey } from "./mgmt-api";

/**
 * What this app will create.
 *
 * The API's enum is `EdDSA|ES256|RS256|HS256` and two of those are not options here. `EdDSA` is
 * refused outright — `POST` answers 422 "Creating EdDSA signing keys is currently not supported",
 * measured 2026-09-25 — so a picker built from the enum offers a choice that always fails. `HS256`
 * is the symmetric legacy this page exists to migrate away from.
 */
export const SIGNING_ALGORITHMS = ["ES256", "RS256"] as const;
export type SigningAlgorithm = (typeof SIGNING_ALGORITHMS)[number];

export const isSigningAlgorithm = (value: unknown): value is SigningAlgorithm =>
  (SIGNING_ALGORITHMS as readonly unknown[]).includes(value);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a string is shaped like a signing key's id, checked before it is put in a URL path.
 *
 * `call()` interpolates a path without escaping it, and the URL parser resolves `../` at parse time
 * — so an unchecked id does not merely name the wrong key, it rewrites which endpoint is called.
 * A `?` does the same through the query string. Every signing key the API returns is a UUID.
 */
export const isKeyId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

/**
 * A key as this page sees one.
 *
 * `public_jwk` is dropped rather than carried: nothing renders it, an RSA modulus is ~342 characters
 * on a part with no cache, and it is the only field that is itself an unfiltered upstream object.
 */
export type SigningKeyRow = Omit<SigningKey, "public_jwk">;

/**
 * What the `signing-keys` part answers with.
 *
 * `useProjectPart<T>` takes the type it is told, so nothing checks this against the reader at the
 * call site — the reader is annotated with it instead, which does.
 */
export type SigningKeysPart = {
  keys: SigningKeyRow[];
  /** Seconds a token stays valid, or `null` when the auth config could not be read. */
  jwtExp: number | null;
};

export type KeyGroups = {
  /** The one key signing new tokens. A project always has exactly one, but nothing enforces that here. */
  current: SigningKeyRow | null;
  /**
   * Prepared and already published in JWKS, signing nothing yet.
   *
   * A list rather than one key: nothing measured says a project may hold only one, and a standby
   * that exists but is not drawn would be a published key the page denies having.
   */
  standby: SigningKeyRow[];
  /** Retired, still verifying the tokens they signed. */
  previous: SigningKeyRow[];
  /** Withdrawn from JWKS. The tokens they signed no longer verify. */
  revoked: SigningKeyRow[];
  /**
   * Anything the API returned with a status this app has never seen.
   *
   * Without it a new upstream status would put a key in no group at all, and the page would simply
   * not draw a key the project has — the failure `standby` above refuses to allow, arriving by a
   * different door. `call()` only casts over `JSON.parse`, so nothing guarantees the union.
   */
  other: SigningKeyRow[];
};

const KNOWN = ["in_use", "standby", "previously_used", "revoked"];

/**
 * The four groups this page is built around, because the statuses are a lifecycle rather than a
 * label: each group answers a different question and carries a different action.
 *
 * Tolerates a missing list: a part that failed hands its readers `undefined`, and grouping nothing
 * should produce empty groups rather than throw.
 */
export function groupKeys(keys: SigningKeyRow[] | undefined): KeyGroups {
  const all = keys ?? [];
  const newestFirst = (a: SigningKeyRow, b: SigningKeyRow) =>
    b.updated_at.localeCompare(a.updated_at);

  return {
    current: all.find((k) => k.status === "in_use") ?? null,
    standby: all.filter((k) => k.status === "standby").sort(newestFirst),
    previous: all.filter((k) => k.status === "previously_used").sort(newestFirst),
    revoked: all.filter((k) => k.status === "revoked").sort(newestFirst),
    other: all.filter((k) => !KNOWN.includes(k.status)).sort(newestFirst),
  };
}

/**
 * How long tokens signed by a retired key still have to live, in words.
 *
 * `null` in, "an unknown time" out: the revoke confirm must not state a wait it could not read.
 *
 * **Rounded up, never to nearest.** This is the wait before revoking is safe, so understating it is
 * the one error with a consequence: a project with `jwt_exp` of 5000 rounds to "1 hour", and anyone
 * who rotated seventy minutes ago reads that as clear and cuts off live sessions.
 */
export function tokenLifetime(jwtExp: number | null): string {
  if (!Number.isFinite(jwtExp) || !jwtExp || jwtExp <= 0) return "an unknown amount of time";
  if (jwtExp < 120) return `${Math.ceil(jwtExp)} seconds`;
  if (jwtExp < 3600) return `${Math.ceil(jwtExp / 60)} minutes`;

  const hours = Math.ceil(jwtExp / 3600);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/**
 * The algorithm as the Supabase dashboard names it, rather than as the API does.
 *
 * `ES256` says nothing about what it is; "ECC (P-256)" is the curve someone would recognise from
 * the `public_jwk`. An algorithm this app cannot create can still arrive from a project that already
 * had one, so the fallback is the raw name rather than nothing.
 *
 * RSA carries no key size, unlike the curve: the one Supabase generates is 2048-bit, but the API
 * accepts an imported `private_jwk` and `public_jwk` is not in this page's payload, so per key there
 * is nothing to check a number against.
 */
export function describeAlgorithm(algorithm: string): string {
  return (
    {
      ES256: "ECC (P-256)",
      RS256: "RSA",
      EdDSA: "EdDSA (Ed25519)",
      HS256: "Legacy HS256 (Shared Secret)",
    }[algorithm] ?? algorithm
  );
}

/** Whether the algorithm has a public half. Decides both the icon and the sentence beside it. */
export const isSymmetric = (algorithm: string) => algorithm === "HS256";

/**
 * What the type column's tooltip says.
 *
 * The distinction worth explaining is not the curve, it is who can verify: an asymmetric key
 * publishes a public half in the project's JWKS and anyone can check a signature against it, while
 * a shared secret can only ever be checked by whoever holds it. That is also why revoking the two
 * kinds means different things, which the revoke confirm then has to say twice.
 */
export function algorithmHint(algorithm: string): string {
  return isSymmetric(algorithm)
    ? "Symmetric. There is no public half to publish, so only Supabase can verify what it signed."
    : "Asymmetric. Clients verify with the public key published in this project's JWKS.";
}

export type StatusBadge = { label: string; tone: "current" | "standby" | "previous" | "revoked" };

/**
 * The status as a badge: what it is called, and how alarming it should look.
 *
 * The labels are the dashboard's — "CURRENT KEY", not "in_use" — because the status column is read
 * at a glance and the API's snake_case is a field name, not a word.
 */
export function statusBadge(status: string): StatusBadge {
  return (
    {
      in_use: { label: "CURRENT KEY", tone: "current" as const },
      standby: { label: "STANDBY KEY", tone: "standby" as const },
      previously_used: { label: "PREVIOUS KEY", tone: "previous" as const },
      revoked: { label: "REVOKED", tone: "revoked" as const },
    }[status] ?? { label: status.toUpperCase(), tone: "standby" as const }
  );
}
