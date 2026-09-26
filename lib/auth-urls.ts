/**
 * URL Configuration: the Site URL and the redirect allow list, as `/config/auth` holds them.
 *
 * Measured 2026-09-27 on a scratch project, restored after:
 *
 * ```
 * uri_allow_list "a, b,b"            200, reads back "a,b,b"  — spaces stripped, duplicates kept
 * uri_allow_list "not a url at all"  200, reads back "notaurlatall"
 * uri_allow_list ~1,900 characters   200
 * uri_allow_list ~9,000 characters   400 "…large values: URI_ALLOW_LIST"
 * site_url "https://*.example.com"   200     site_url "not a url"  200     site_url ""  400
 * ```
 *
 * The API checks nothing it could be trusted with, so the checks are here, as the original keeps
 * them in its client: its URL patterns, no duplicates, 2 KiB in all.
 */
export const MAX_ALLOW_LIST = 2 * 1024;

export type UrlConfig = { siteUrl: string; redirectUrls: string[] };

// The original's patterns (`Auth/Auth.constants.ts`), verbatim: parity means accepting what it
// accepts, odd corners included.
const baseUrlRegex =
  /^((ftp|http|https):\/\/)?(www.)?(?!.*(ftp|http|https|www.))[a-zA-Z0-9_*-]+(\.[a-zA-Z0-9_*-]+)+((\/)[\w#]+)*(\/\w+\?[a-zA-Z0-9_]+=\w+(&[a-zA-Z0-9_]+=\w+)*)+(?:\.[a-z]+)*(?::\d+)?(?![^<]*(?:<\/\w+>|\/?>))(.*)?\/?(.)*?$/;
const appRegex =
  /^[a-z0-9-]+([.][a-z0-9]+)*:\/(\/[-a-z0-9._~!$&'()*+,;=:@%]+)+(?:\.[a-z]+)*(?::\d+)?(?![^<]*(?:<\/\w+>|\/?>))(.*)?\/?(.)*?$/i;
const localhostRegex = /^(?:^|\s)((https?:\/\/)?(?:localhost|[\w-]+(?:\.[\w-]+)+)(:\d+)?(\/\S*)?)/i;
const chromeExtensionRegex = /chrome-extension:\/\/([a-zA-Z]*)/;
const customSchemeRegex = /^([a-zA-Z][a-zA-Z0-9+.-]*):(?:\/{1,3})?([a-zA-Z0-9_.-]*)$/;
const simpleDomainRegex = /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;

const REDIRECT_URL = new RegExp(
  `(?!${simpleDomainRegex.source})((${baseUrlRegex.source})|(${localhostRegex.source})|(${appRegex.source})|(${chromeExtensionRegex.source})|(${customSchemeRegex.source}))`,
  "i",
);

/** One entry as the original tidies it: trimmed, a trailing comma dropped. */
const normalize = (url: string) => url.trim().replace(/\s*,\s*$/, "");

/** The saved string as a list: split on commas, tidied, empties and repeats dropped. */
export function parseRedirectUrls(list: unknown): string[] {
  if (typeof list !== "string") return [];
  return [...new Set(list.split(",").map(normalize).filter(Boolean))];
}

export const pickUrlConfig = (raw: Record<string, unknown>): UrlConfig => ({
  siteUrl: typeof raw.site_url === "string" ? raw.site_url : "",
  redirectUrls: parseRedirectUrls(raw.uri_allow_list),
});

/** Several URLs pasted into one field, as the original splits them. */
export const splitPasted = (text: string) => text.split(/[\s,]+/).filter(Boolean);

/**
 * Three characters refused before the patterns run. Whitespace: the API would strip it and save a
 * different URL. A comma: it is the list's separator, so it would smuggle a second entry past every
 * check. `>`: with it, `appRegex`'s trailing lookahead backtracks cubically — a 2,048-character
 * line took 77ms, two hundred of them 15.7s on the server. Without it the patterns run in linear time.
 */
export const isRedirectUrl = (url: string) => !/[\s,>]/.test(url) && REDIRECT_URL.test(url);

export function siteUrlProblem(value: string): string | null {
  const url = value.trim();
  if (!url) return "Must have a Site URL";
  if (url.includes("*")) return "Wildcards cannot be used in the Site URL";
  if (url.includes(",") || /\s/.test(url)) return "The Site URL is a single URL";
  try {
    new URL(url);
  } catch {
    return "Please provide a valid URL";
  }
  return null;
}

/**
 * The list with `added` appended, or a reason per row (null where a row is fine) and one for the
 * whole — the original's four checks, in its words.
 */
export function withAdded(
  existing: string[],
  added: string[],
): { ok: true; list: string } | { ok: false; reason: string; rows: (string | null)[] } {
  const seen = new Set<string>();
  const rows = added.map((raw) => {
    const url = normalize(raw);
    let problem: string | null = null;
    if (!url) problem = "Please provide a value";
    else if (!isRedirectUrl(url)) problem = "Please provide a valid URL";
    else if (existing.includes(url)) problem = "URL already exists in the allow list";
    else if (seen.has(url)) problem = "URL already exists in this list";
    seen.add(url);
    return problem;
  });

  const first = rows.find((r) => r !== null);
  if (first || added.length === 0) return { ok: false, reason: first ?? "Nothing to add.", rows };

  const next = [...existing, ...added.map(normalize)];
  const list = next.join(",");
  if (list.length > MAX_ALLOW_LIST) {
    return { ok: false, reason: "Too many redirect URLs, please remove some or try to use wildcards", rows };
  }
  return { ok: true, list };
}

export const withoutUrls = (existing: string[], removed: string[]) =>
  existing.filter((url) => !removed.includes(url)).join(",");
