/**
 * Open-redirect guard for `next`-style parameters.
 *
 * A `startsWith("/")` check is not enough: "//evil.com" is a valid protocol-relative URL and browsers
 * follow it off-site. Allowlist plain internal paths instead, and fall back to the root.
 */
export const safePath = (value: string | null | undefined) =>
  value && /^\/[A-Za-z0-9\-_/]*$/.test(value) ? value : "/";
