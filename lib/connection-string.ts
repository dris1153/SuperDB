/**
 * Puts a real password into a connection string, structurally.
 *
 * **Not by matching the placeholder.** The transaction and session pooler strings come back verbatim
 * from the Management API, and what they put where the password goes is unknown here — the only
 * literal `[YOUR-PASSWORD]` in this repo is the one the app writes itself for the direct string.
 * Matching on it would be a guess about the other two.
 *
 * All three are URIs of the shape `scheme://user:password@host:port/db`, so replacing whatever sits
 * between the last colon of the userinfo and the `@` works whatever the placeholder says. The unknown
 * disappears rather than needing to be verified.
 *
 * `new URL()` was considered and rejected: the `[` and `]` in the current placeholder sit in the
 * userinfo, where a spec-compliant parser is lenient and may percent-encode on its way back out — less
 * predictable here than a narrow pattern.
 */
const USERINFO = /^([a-z+]+:\/\/[^:@/]+:)[^@]*(@)/i;

/**
 * The password is encoded, and that is not optional.
 *
 * `@`, `:`, `/`, `?` and `#` all mean something in the userinfo of a `postgresql://` URI. `#` is the
 * cruel one — it opens a fragment, so everything after it is dropped and the connection fails with a
 * password that looks perfectly correct on screen. Generated passwords are alphanumeric and avoid
 * this entirely; a typed one can be anything.
 *
 * Returns the string unchanged when there is no password to insert, or when the string is not shaped
 * like a URI with userinfo — a silent no-op beats producing something that looks like a connection
 * string and is not one.
 */
export function withPassword(connectionString: string, password: string): string {
  if (!password) return connectionString;
  return connectionString.replace(USERINFO, `$1${encodeURIComponent(password)}$2`);
}
