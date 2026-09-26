/**
 * Where to land after signing in: a path on this site, or the board. `//evil.example` and
 * `/\evil.example` look like paths and navigate off-site, so the check is the URL parser's, not a prefix.
 */
export function safeNext(value: string | null | undefined): string {
  if (!value?.startsWith("/")) return "/";
  try {
    const url = new URL(value, "http://same.invalid");
    if (url.origin !== "http://same.invalid" || url.pathname.startsWith("/login")) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}
