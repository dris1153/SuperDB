/**
 * How the project rail is showing itself, and where that choice is kept.
 *
 * **A cookie, not `localStorage`.** The server cannot read `localStorage`, so it would render a
 * default and let the browser correct it after mount — which in `expanded` means a 250px column
 * appearing and shoving the content sideways on every single load. A cookie is readable in the
 * layout, so the first paint is already right. `localStorage` alongside it was considered and
 * dropped: nothing would ever read it, and a store nothing reads is not a fallback, it is dead code.
 */
export const NAV_MODES = ["expanded", "collapsed", "hover"] as const;

export type NavMode = (typeof NAV_MODES)[number];

export const NAV_MODE_COOKIE = "superdb-nav-mode";

/** What Supabase opens with, and the only mode where the rail is both narrow and fully labelled. */
export const DEFAULT_NAV_MODE: NavMode = "hover";

/** Anything unrecognised is the default: a cookie is user-writable and arrives as an unknown string. */
export function parseNavMode(raw: string | undefined | null): NavMode {
  return NAV_MODES.includes(raw as NavMode) ? (raw as NavMode) : DEFAULT_NAV_MODE;
}

export const NAV_MODE_LABELS: Record<NavMode, string> = {
  expanded: "Expanded",
  collapsed: "Collapsed",
  hover: "Expand on hover",
};

/**
 * One year, and `lax` because this is read while rendering a page the user navigated to — it never
 * needs to survive a cross-site POST, and `strict` would drop it on the first click in from anywhere.
 */
export const navModeCookie = (mode: NavMode) =>
  `${NAV_MODE_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
