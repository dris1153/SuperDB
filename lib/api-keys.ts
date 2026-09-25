import type { ApiKey } from "./mgmt-api";

/**
 * The mask Supabase puts over a secret key it will not show you.
 *
 * **A masked secret and a complete one are the same length** — 41 characters either way, measured
 * 2026-09-25. So the obvious test, `value.length < something`, is wrong in both directions: it reads
 * a mask as a key and offers to copy twenty-six dots. The character is the only thing that differs.
 */
const MASK = "·";

export const isMasked = (value: string | null | undefined): boolean => !!value?.includes(MASK);

/**
 * What a key row may show without anyone asking.
 *
 * Two of the four types are meant to be public — `publishable` and the legacy `anon` — and are what
 * a client application embeds. The other two are not: the legacy `service_role` bypasses Row Level
 * Security, and `secret` is its replacement. Those carry no value here at all; the page shows their
 * prefix and fetches the rest only when someone asks for it.
 *
 * This is the same line `KeySummary` in `project-parts.ts` draws, drawn once more at a different
 * width. `service_role` arrives from the API **complete and unmasked with no special permission**,
 * so every reader that touches this response has to drop it deliberately.
 */
export type KeyRow = {
  id: string | null;
  name: string;
  type: ApiKey["type"];
  prefix: string | null;
  description: string | null;
  /** The key itself, only for the types that are safe in public. Null for everything else. */
  value: string | null;
  /**
   * What to show before anyone asks to reveal — and it is **not** the prefix.
   *
   * The prefix is only a prefix for the newer types: `sb_publishable_NeIMo` really is the first 20
   * characters of that key. For the legacy pair it is an unrelated identifier — `service_role`'s is
   * `a5fKL` while the key itself begins `eyJhbGciOiJIUzI1` — so rendering it looked like a short
   * complete key rather than a hidden one. Measured 2026-09-25.
   */
  display: string;
  /** True when the API sent a mask instead of the key — never true for a value that is shown. */
  masked: boolean;
};

/**
 * Stands in for a key with nothing showable about it.
 *
 * A fixed width on purpose: matching the real length would publish how long the key is, and the
 * legacy JWTs differ in length between `anon` and `service_role`.
 */
const HIDDEN = "•".repeat(24);

const PUBLIC_TYPES = new Set(["publishable"]);

/** The legacy pair share a type, so the public one is told apart by name. */
const isPublic = (key: ApiKey) =>
  PUBLIC_TYPES.has(key.type ?? "") || (key.type === "legacy" && key.name === "anon");

export function toRow(key: ApiKey): KeyRow {
  const masked = isMasked(key.api_key);

  return {
    id: key.id,
    name: key.name,
    type: key.type,
    prefix: key.prefix,
    description: (key as ApiKey & { description?: string | null }).description ?? null,
    // Masked values are dropped rather than passed along: a row that carried one would have to
    // remember not to offer it for copying, and forgetting is the whole failure mode here.
    value: isPublic(key) && !masked ? key.api_key : null,
    // The API's own mask when it sent one — `sb_secret_plAo7` followed by dots is exactly the right
    // thing to show, and the first version of this threw it away and rendered the prefix instead.
    display: masked ? (key.api_key ?? HIDDEN) : isPublic(key) ? (key.api_key ?? HIDDEN) : HIDDEN,
    masked,
  };
}

/**
 * Whether `GET /api-keys/{id}` will accept this id.
 *
 * Measured 2026-09-25: the legacy pair carry an `id` of `"anon"` and `"service_role"` — their own
 * names — while `publishable` and `secret` carry a UUID. The single-key endpoint answers
 * `400 {"message":"id: Invalid UUID"}` for the former, so those two can only be found in the list.
 * Nothing in the spec says this.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isAddressableById = (id: string | null | undefined): boolean => UUID.test(id ?? "");

/**
 * What the API will accept as a key name, measured rather than read.
 *
 * The OpenAPI document declares **no 400 at all** for these endpoints. The API returns them, and
 * these are its own words, from 2026-09-25:
 *
 * - `name: Too small: expected string to have >=4 characters`
 * - `name: Too big: expected string to have <=64 characters`
 * - `name: Name must start with a lowercase letter or an underscore, followed only by lowercase
 *   alphanumeric characters or underscore`
 *
 * Checked here so a typo costs nothing, **not** as a boundary: this is a snapshot of one day's
 * behaviour, and when the two disagree the API's own message is what the user should see.
 */
const NAME = /^[a-z_][a-z0-9_]*$/;

export function nameProblem(name: string): string | null {
  if (name.length < 4) return "At least 4 characters.";
  if (name.length > 64) return "At most 64 characters.";
  if (!NAME.test(name)) {
    return "Lowercase letters, numbers and underscores only, starting with a letter or underscore.";
  }
  return null;
}

/** Which tab a key belongs to. The screenshot's two tabs are one list, split by type. */
export const isLegacy = (key: Pick<KeyRow, "type">) => key.type === "legacy";
