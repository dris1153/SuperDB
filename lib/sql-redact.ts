/**
 * Takes password literals out of a statement before it is recorded.
 *
 * `connection_events` is append-only by policy — it has `select` and `insert` and nothing else — and
 * the settings page renders `detail` verbatim. So a statement recorded with a password in it is a
 * plaintext secret at rest, in backups, with no way to delete the row. The SQL editor is the first
 * path in this app that can run `alter user … password '…'` at all; the table editor only ever
 * recorded row keys.
 *
 * Only the `password '…'` form is handled, which is Postgres's syntax for it. This is not a
 * scrubber for every way a secret could reach a statement — a value inserted into a table is still
 * recorded as written — it removes the one case the grammar makes recognisable.
 */
const PASSWORD_LITERAL = /(password\s+)'(?:[^']|'')*'/gi;

export const redactSqlSecrets = (sql: string) => sql.replace(PASSWORD_LITERAL, "$1'[redacted]'");
