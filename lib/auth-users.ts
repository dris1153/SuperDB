/**
 * A project's users, as its own GoTrue reports them.
 *
 * Pure, and separate from `auth-api.ts` for the reason `project-part-names.ts` gives: that module is
 * `server-only` and reaches a live API, so `pnpm test` cannot import it.
 */
export type AuthUser = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  /** Absent — not null — on a user created with `email_confirm: false`. Measured. */
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  app_metadata?: { provider?: string; providers?: string[] };
  user_metadata?: Record<string, unknown>;
};

/** Fifty rows is what the original pages by, and the endpoint takes it as `per_page`. */
export const PER_PAGE = 50;

/**
 * Which providers a user can sign in with.
 *
 * `providers` is the list and `provider` is the first of them; a user with neither is possible and
 * reads as no provider rather than as an empty string.
 */
export function providersOf(user: AuthUser): string[] {
  const { providers, provider } = user.app_metadata ?? {};
  if (Array.isArray(providers) && providers.length > 0) return providers;
  return provider ? [provider] : [];
}

/**
 * The Provider type column.
 *
 * **This rule is ours, not Supabase's.** The dashboard shows a column by this name and the API
 * returns no such field, so it is derived: an `sso:` provider means SSO, `email`, `phone` and
 * `anonymous` are the ones GoTrue handles itself, and anything else is a third party.
 */
export function providerTypeOf(user: AuthUser): string {
  const providers = providersOf(user);
  if (providers.length === 0) return "—";
  if (providers.some((p) => p.startsWith("sso"))) return "SSO";

  const builtin = new Set(["email", "phone", "anonymous"]);
  return providers.every((p) => builtin.has(p)) ? "Basic Auth" : "OAuth";
}

/**
 * The name to show when the user has one.
 *
 * `user_metadata` is whatever the project put there, so each candidate is checked for being a
 * string: a project storing `{display_name: {first, last}}` would otherwise render `[object Object]`
 * into the table.
 */
export function displayNameOf(user: AuthUser): string | null {
  for (const key of ["display_name", "full_name", "name"]) {
    const value = user.user_metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** Whether a ban is in force now, rather than whether one was ever set. */
export function isBanned(user: AuthUser, now = Date.now()): boolean {
  if (!user.banned_until) return false;
  const until = Date.parse(user.banned_until);
  return Number.isFinite(until) && until > now;
}

/**
 * How many pages the total spans. One when there is nothing, because a list of no users is still a
 * page saying so.
 */
export function pageCount(total: number | null, perPage = PER_PAGE): number {
  if (total === null || !Number.isFinite(total) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / perPage));
}

/** "1 user", "12 users" — the line the original prints above the table. */
export const userCount = (total: number | null): string =>
  total === null ? "Total: unknown" : `Total: ${total} ${total === 1 ? "user" : "users"}`;

/**
 * A user id, checked before it becomes part of a URL path.
 *
 * The same check `isKeyId` exists for, and for the same reason: `lib/auth-user-actions.ts` is
 * `"use server"`, so every export is an endpoint a browser can call with any string, and these ids
 * are interpolated into `/admin/users/{id}`. `..` survives `encodeURIComponent`, and the URL parser
 * resolves it before the request leaves — aiming a `service_role` DELETE at another path.
 */
export const isUserId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Loose on purpose: GoTrue decides what it accepts, this only refuses what is obviously not one. */
export const looksLikeEmail = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/**
 * How long a ban lasts.
 *
 * Go duration strings, which is what GoTrue parses — it has no unit above the hour, so a week is
 * 168h rather than `7d`. `none` is the lift, sent through the same field.
 */
export const BAN_DURATIONS = [
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "168h", label: "7 days" },
  { value: "720h", label: "30 days" },
  { value: "876000h", label: "100 years" },
] as const;

export type BanDuration = (typeof BAN_DURATIONS)[number]["value"] | "none";

export const isBanDuration = (value: unknown): value is BanDuration =>
  value === "none" || BAN_DURATIONS.some((d) => d.value === value);

/** The three things `generate_link` is used for here. Each one sends mail. */
export const LINK_TYPES = ["magiclink", "recovery", "invite"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const isLinkType = (value: unknown): value is LinkType =>
  (LINK_TYPES as readonly unknown[]).includes(value);
