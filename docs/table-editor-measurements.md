# What was measured, not assumed

Every line here was established by running it against a live Supabase project, on tables created and
dropped for the purpose. They are recorded because several are counter-intuitive enough that the code
implementing them looks wrong without the reason, and because re-deriving them costs another round of
probing.

Where a fact contradicts an earlier assumption, the assumption is named too — a fact is easier to
trust when you can see what it replaced.

## The query endpoints

- **The write endpoint runs as `postgres`.** Full DDL rights, RLS bypassed, any schema. Its
  `search_path` is `"$user", public, extensions`, with `pg_catalog` searched first whether or not it
  is named. That is why the type allowlist reads exactly those three schemas and prefers
  `pg_catalog` on a name collision.
- **`read_only: true` genuinely blocks writes**, answering `25006`. It works as a second guard on any
  query that is meant to be a read.
- **Multi-statement requests are atomic.** A request whose *first* statement renamed a column
  successfully and whose second statement failed left the column **unrenamed** — the implicit
  transaction rolls the whole request back. This is what lets `create table` + `enable row level
  security` and `alter column` + `rename column` each be sent as one request. Only the last result
  set comes back, which nothing in the editor reads.
- **A server action's request body is capped at 1 MB** by Next's default, and `next.config.ts` does
  not raise it. Measured: 500 rows carrying a 2 KB text column encode to 987 KB. CSV batches are
  therefore bounded by bytes as well as by row count.
- **Backslashes pass through unchanged**, one for one, in both string literals and quoted
  identifiers. An earlier reading suggested the endpoint mangled them; that turned out to be the
  probe script's own escaping, not the API's. Nothing needs a transport-level escape.

## Type coercion through `jsonb_to_record`

- **JSON strings coerce into non-text targets.** `"true"` into `bool`, `"42"` into `int4`, an ISO
  string into `timestamptz`, and a UUID string into `uuid` all land correctly. This is why the write
  layer can send a boolean as the string the editor's switch produces.
- **Text fed to a `jsonb` target stores a JSON *string*.** Writing the text `{"a":1}` produced
  `jsonb_typeof = string`, not an object. Every `json`/`jsonb` value is therefore parsed before it is
  sent.
- **An empty string is not neutral.** `""` into an `int4` or a `timestamptz` fails the whole
  statement; `""` into a `jsonb` is *accepted* and stored as the JSON string `""` — a wrong value,
  silently. Only a textual column treats an empty field as a value.
- **Arrays accept both notations.** `{urgent,archived}` and `["urgent","archived"]` both land as the
  same `text[]`, and `"{}"` lands as an empty array. This matters because the two halves of the read
  path disagree: a non-wide array such as `int4[]` is read raw and arrives as a JS array, while a
  wide one such as `text[]` is cast to text and arrives as a Postgres literal.
- **A `bigint` past `Number.MAX_SAFE_INTEGER` arrives as a JSON string**, so numeric text is passed
  through rather than rounded into a double.

## Writes

- **A column reaches its DEFAULT only by being absent from the INSERT column list.** A row omitting
  `made_at timestamptz default now()` while another row supplied it stored **NULL**, not the
  timestamp. Hence the rule that every row in one insert must name the same columns.
- **A hostile value is stored as data.** A payload carrying `x'; drop table bookmarks; --`, `$$`, a
  fabricated dollar-quote tag, backslashes, newlines, doubled quotes and emoji round-tripped byte for
  byte, in both the row path and a CSV import.
- **Identity primary keys stay usable.** `generated always as identity` on the key still addresses
  rows for update and delete — which is why the generated-column guard covers the columns a statement
  *writes* and never the key.
- **A stored generated column recomputes** after every write, and cannot be written to.
- **Views report `reltuples = -1`**, which is how the footer knows an estimate is meaningless there.

## Identifiers

- **NAMEDATALEN is 63 *bytes*, not characters.** A 32-character CJK table name (96 bytes) was created
  as 21 characters, with only a NOTICE. A length check counting characters would have let it through
  and the preview would have named a table that does not exist.
- **`format_type` omits the schema for anything on the session's `search_path`.** Catalog reads that
  feed a name back to the write endpoint start with `set local search_path = ''` so the type comes
  back fully qualified; the write endpoint resolves bare names under its own path, which is a
  different one.

## Display truncation

The grid cuts wide values at 512 characters *in SQL*, with Postgres appending the ellipsis.
Recognising such a value again is what stops it being written back over the real one.

- **`left(x, 512)` counts code points; `String.length` counts UTF-16 units.** The 512-character prefix
  of a string beginning with emoji arrives with `.length === 813`. A length test in units misses the
  truncation entirely, which made the shortened value editable *and* writable. The check counts code
  points.
- A truncated value is refused everywhere it could be written, **including as a key**, where it would
  otherwise match nothing and read as success.

## CSV

`toCsv` writes NULL as nothing and an empty string as `""`, and `parseCsv` reads that distinction
back. Everything below follows from wanting an export to re-import unchanged.

- **A newline inside a quoted field** is the case that decides the parser's shape: splitting on lines
  first cuts such a record in half, and the app's own export produces exactly that file.
- **A quoted field that is never closed** used to swallow the rest of the file into one value, with
  no error and no ragged line. It is now an error naming the line the quote opened on.
- **A blank line is a record holding one empty field**, not a line that never happened. Treating it
  as nothing dropped a NULL row on a single-column file and left the confirmation's count quietly
  lower than the file.
- **Ragged lines are reported by number and left out**, never padded: a short row padded with nulls
  writes NULL over columns nobody mentioned.
- Doubled quotes, CRLF and LF endings, a trailing newline, and a leading BOM all behave as RFC 4180
  requires.
