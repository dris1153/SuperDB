---
phase: 4
title: "CSV import"
status: pending
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

## Success Criteria

- [ ] `pnpm typecheck` clean; CSV parser tests pass, including newline-in-quotes
- [ ] A file exported by the polish plan's export re-imports into an empty table unchanged
- [ ] Importing 1,200 rows batches correctly and reports the true total
- [ ] A row with a bad value fails its batch and the report names the batch and the count committed
- [ ] An oversized file is refused with the cap stated
- [ ] A hostile value in a CSV field is stored as data
- [ ] The import is recorded in `connection_events`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Partial import presented as all-or-nothing | Batches are separate transactions; the report says exactly how far it got |
| A naive parser mangles quoted newlines | Tested first, against the export's own output |
| A large file produces a request the endpoint refuses | Batch at 500 rows; cap the file |
| Empty string silently becomes null, or the reverse | One explicit choice for the import, stated in the UI |
| Column mapping guesses wrong silently | Mapping is shown and editable before anything is written |
