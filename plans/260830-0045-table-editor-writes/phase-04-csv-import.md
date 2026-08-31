---
phase: 4
title: "CSV import"
status: completed
priority: P3
effort: "1d"
dependencies: [1, 2]
---

# Phase B4: CSV import

## Overview

Bulk insert from a file. The counterpart to the CSV export in the polish plan, and the last phase
because it is the least essential and the easiest to get subtly wrong.

## Requirements

**Functional**
- Choose a CSV file, see a preview of the parsed rows, map columns, and import.
- Report how many rows will be inserted before inserting them.
- Report what actually happened, including a failure partway through.

**Non-functional**
- Parsing happens in the browser; only parsed rows cross to the server, as JSON.
- Bounded: a file larger than the cap is refused with the cap stated, not truncated silently.
- A failed import says how many rows were written before it failed. Silence here is worse than an error.

## Architecture

The file never reaches SQL as text. It is parsed client-side into rows, and those rows go through the
**same** `buildInsert` path as a single-row insert from B1 — `jsonb_to_recordset` with one dollar-quoted
literal. A CSV import is a multi-row insert and nothing more; giving it its own SQL path would mean a
second construction to keep safe.

```
file ─▶ parse (client) ─▶ map columns ─▶ preview ─▶ confirm ─▶ buildInsert in batches ─▶ report
```

### Batching

One statement per batch of rows — 500 is a reasonable start, matching the page size cap. Batching
matters because the whole file arrives in one JSON literal otherwise, and a large file would produce
a request the endpoint refuses.

Batches are **not** a transaction. Multi-statement requests return only the last result set, and
wrapping the whole import in `BEGIN … COMMIT` across several requests is not possible — each request
is its own transaction. So a failure at batch 7 of 20 leaves batches 1–6 committed. That has to be
reported honestly rather than presented as all-or-nothing.

## Related Code Files

**Create**
- `lib/csv-parse.ts`, `lib/csv-parse.test.ts`
- `components/table-editor/import-sheet.tsx`

**Modify**
- `lib/write-actions.ts` — `importRows`
- `components/table-editor/toolbar.tsx` — the import entry

## Implementation Steps

### 1. `lib/csv-parse.ts` — tests first

Hand-written, no dependency. RFC 4180 is small and the repo has no parsing library.

Tests before implementation:
- a quoted field containing a comma
- a quoted field containing a doubled `""`
- a quoted field containing a newline — the case that breaks line-splitting parsers
- CRLF and LF line endings both
- a trailing newline does not produce a phantom empty row
- an empty field and a quoted empty field are both empty strings
- ragged rows (fewer or more fields than the header) are reported, not silently padded

The newline-inside-quotes case is the one that catches naive implementations, and it is exactly what
the export in the polish plan produces.

### 2. Column mapping

Match CSV headers to column names case-insensitively, then let the user correct it. Unmapped table
columns take their default; unmapped CSV columns are dropped, and the UI says which.

The brainstorm left open whether this UI is worth building versus pasting TSV into the grid. Build the
mapping: an import that guesses wrong silently is worse than no import, and pasting depends on B2's
inline editing being extended rather than reused.

### 3. Type handling

CSV is all strings. `jsonb_to_recordset`'s `as x(...)` clause does the coercion, using each column's
real type — the same mechanism as B1, so nothing new is needed. A value that will not coerce fails the
whole batch, which is why the preview matters.

Empty string versus null: a CSV cannot distinguish them. Offer one explicit choice for the whole
import — "treat empty fields as NULL" — defaulting to on, since the export writes nothing for null.

### 4. Bounds

Cap the file at 5 MB and 50,000 rows, stated up front. Larger belongs in `psql` or a migration, and
saying so is more useful than a timeout.

### 5. Reporting

Progress by batch. On failure: which batch, the database's own message, and **how many rows were
committed before it failed**.

## Outcome

Built as planned, with five decisions worth recording.

**The parser distinguishes an unquoted empty field from `""`.** The plan's own test list asked for
both to read as empty strings, but its success criteria also ask for an export to re-import
unchanged — and `toCsv` writes NULL as nothing and an empty string as `""`. Collapsing them would
make that round trip impossible. So a cell is `null` when the field was empty *and unquoted*, and
`""` when it was written as `""`. The import-wide "treat empty fields as NULL" choice then applies
only to the unquoted case, which is the one where nobody said what they meant.

**There is no `importRows` action.** The plan named one, but the same document says an import is a
multi-row insert and nothing more, and `insertRows` already takes an array. Adding a second entry
point would have meant a second thing to keep safe. The sheet sends one batch per call, which is
also what makes progress real rather than implied.

**Ragged lines are left out, not padded and not fatal.** A short row padded with nulls writes NULL
over columns nobody mentioned — silent loss on any table whose columns have defaults. The line
numbers are listed before anything is written, and the confirmation's row count already excludes
them, so what it promises is what it inserts.

**Booleans are normalised before `parseValue` sees them.** That function accepts only `true` and
`false`, because the editor's switch is bound to `value === "true"` and the two must not disagree.
An import has no switch, and a spreadsheet writes `TRUE`, `t`, `yes`, `1`. The normalisation lives
in `csv-import.ts`, where the reason is local — it feeds the one rule rather than adding a second.

**Split into `csv-parse.ts` and `csv-import.ts`.** The plan named one file; the mapping and value
rules are where an import goes quietly wrong, so they are pure and tested separately rather than
living in the sheet.

`Import` is hidden on a view or a keyless table rather than disabled, unlike `Insert` beside it:
Insert's tooltip is the only place that says why, and two controls repeating it is noise.

### Verified live

Against `superdb_probe_import` and `superdb_probe_import2`, created and dropped on a real project,
driven end to end by the same modules the sheet calls:

- **Round trip identical.** Three rows written by `toCsv` — one carrying `x'; drop table bookmarks;
  --`, `$$`, a backslash, an embedded newline, doubled quotes and an emoji; one with an empty string
  beside a NULL; one with nested `jsonb` — parsed, mapped and inserted, and read back byte-identical
  to the source, NULL and `""` still distinct.
- **1,200 rows** batched 500 + 500 + 200, `RETURNING` reporting 1,200, and 1,200 in the table.
- **A failure partway.** Batch 2 hit a duplicate key: the whole batch rolled back, the 2 rows from
  batch 1 stayed, and the count the report shows is the count in the table. A NOT NULL violation
  behaves the same.
- **A bad value the database never sees.** `abc` in an `integer` column is refused client-side with
  the line and column named, and the other rows still import.

After the review fixes, on `superdb_probe_import3`: the round trip is still exact; a
quote-everything row `"7","x","","",""` stores real NULLs (`jsonb_typeof` is null, not `"string"`)
instead of killing the batch; an unterminated quote is refused naming its line; a blank line survives
as a NULL row; and a wide file batches 346 + 154 with a peak body of 683 KB.

### Review findings and what was done

The review found three ways the file could be read wrong in silence. Each was reproduced before it
was changed, and the fixed pipeline re-measured against a live table.

**A quoted field that never closed swallowed the rest of the file.** One stray `"` on line 2 of a
thousand-line file parsed as two rows plus a single value containing everything after it — no error,
no ragged line, and a preview that truncates the evidence out of sight. It now throws, naming the
line the quote opened on.

**A blank line was dropped rather than read.** The end-of-record test asked whether anything had been
started, so a line with nothing on it produced no record at all: on a single-column file a NULL row
disappeared and nothing said so, and the count the confirmation promised was quietly lower than the
file. A newline outside quotes now always ends a record — a blank line is one empty field, which on
one column is a NULL row and on more is ragged and reported.

**An empty field was written into every type as an empty string.** Measured: `""` reaching an `int4`
or a `timestamptz` fails the whole batch of 500 with no line number, and `""` reaching a `jsonb` is
*accepted* and stored as the JSON string `""` — the wrong value, silently, with no undo. A file from
any quote-everything exporter is exactly that shape. An empty field is now settled by the column's
type first: only a textual column can hold one, so only there does the quoted/unquoted distinction
survive; elsewhere empty means absent, and a NOT NULL column says so by line rather than at the
database. The same rule catches whitespace-only text in a numeric column, which `Number("  ")` had
been turning into a column of zeroes.

**Batches were bounded by rows only.** A server action's POST body is capped at 1 MB by default and
`next.config.ts` does not raise it; 500 rows carrying a 2 KB column measures 987 KB, so the row cap
alone would have produced a 413 the sheet could only report as "the request failed before it
answered". Batches now close on 700 KB as well as on 500 rows — the wide file above splits 346 + 154,
peaking at 683 KB.

Also taken: the mapping is keyed by header **position**, since two columns may share a name and
keying by the name made them one control that silently kept the rightmost value; nothing mapped now
yields no rows rather than a row of no columns that `buildInsert` would refuse after the confirmation
had already promised N; the file is cleared after a successful import, so the button cannot be
pressed again while the report still reads "Imported 1200 rows"; a second file pick discards the
first one's answer rather than racing it; `buildImportRows` is memoised, since the batch loop sets
state on every batch and this walks the whole file; and a file that is not UTF-8 is called out rather
than imported as mojibake.

Two were left alone. **Whitespace before an opening quote** shifts the delimiter — RFC-correct, and
what every other parser does; the preview shows the parsed cells rather than the file, which is what
catches it. **Text after a closing quote** is dropped, which is the lenient reading and now says so
in a comment: it is the one malformation that yields a plausible-looking value.

## Success Criteria

- [x] `pnpm typecheck` clean; CSV parser tests pass (41 across both modules), including
      newline-in-quotes; 253 in total; lint and build clean
- [x] A file exported by the polish plan's export re-imports into an empty table unchanged
- [x] Importing 1,200 rows batches correctly and reports the true total
- [x] A row with a bad value fails its batch and the report names the batch and the count committed
- [x] An oversized file is refused with the cap stated
- [x] A hostile value in a CSV field is stored as data
- [x] The import is recorded in `connection_events`

The audit criterion is inherited rather than rebuilt: every batch goes through `insertRows`, whose
`run()` records on success and failure alike. An import of 1,200 rows therefore leaves three audit
rows, one per batch, each with its own affected count — which is what actually happened.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Partial import presented as all-or-nothing | Batches are separate transactions; the report says exactly how far it got |
| A naive parser mangles quoted newlines | Tested first, against the export's own output |
| A large file produces a request the endpoint refuses | Batch at 500 rows; cap the file |
| Empty string silently becomes null, or the reverse | One explicit choice for the import, stated in the UI |
| Column mapping guesses wrong silently | Mapping is shown and editable before anything is written |
