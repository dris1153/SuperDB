/**
 * A database password that cannot break the connection string it will be pasted into.
 *
 * **Alphanumeric, and that is the point.** `@`, `:`, `/`, `?` and `#` all have meaning in the
 * userinfo of a `postgresql://` URI and must be percent-encoded there — `#` worst of all, because it
 * opens a fragment, so the connection fails while the password looks correct on screen. Encoding at
 * every substitution site would work until one site forgot. Supabase's own generator makes the same
 * choice for the same reason.
 *
 * Sixteen characters over sixty-two is about 95 bits, which is a wide margin for something reachable
 * from the internet. The API's own floor is `minLength: 4` — read from the OpenAPI spec — so it would
 * accept `aaaa`; matching upstream here would be restating someone else's mistake rather than
 * validating anything.
 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LENGTH = 16;

/** Below this, refuse. Deliberately far above the API's own minimum of 4. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Rejection sampling, because 62 does not divide 256.
 *
 * `byte % 62` would make the first four letters of the alphabet measurably likelier than the rest —
 * 256 = 4×62 + 8, so bytes 248..255 fold back onto `A`-`D`. Drawing again for those eight values
 * costs about 3% of the bytes and removes the bias entirely.
 */
const CEILING = 256 - (256 % ALPHABET.length);

export function generatePassword(
  random: (bytes: Uint8Array) => void = (bytes) => crypto.getRandomValues(bytes),
): string {
  let out = "";

  while (out.length < LENGTH) {
    // A whole draw at a time rather than one byte per call: the rejected ones are cheap, and asking
    // for the remainder plus a margin keeps this to one or two calls in practice.
    const draw = new Uint8Array(LENGTH - out.length + 8);
    random(draw);

    for (const byte of draw) {
      if (out.length === LENGTH) break;
      if (byte >= CEILING) continue;
      out += ALPHABET[byte % ALPHABET.length];
    }
  }

  return out;
}

/** What the reset action checks before it forwards anything to Supabase. */
export function passwordProblem(password: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `A database password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
