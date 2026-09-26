---
phase: 4
title: "Duplicate table"
status: pending
priority: P2
effort: "3h"
dependencies: [1]
---

# Phase 4: Duplicate table

## Requirements

A dialog: the new name (default `{table}_duplicate`), *Copy data* off by default, the statement
shown before it runs.

## Architecture

The original's recipe, measured before it is trusted:

1. `create table new (like old including all)` — columns, defaults, constraints, indexes, identity.
2. The source's foreign keys, re-added — `including all` does not copy them.
3. `comment on table`, and `enable row level security` when the source has it.
4. With *Copy data*: `insert … select`, naming the columns that are not generated, with
   `overriding system value` for identity; then each identity sequence moved past the copied max.

Policies are **not** copied — the original does not either — and the confirm says so, since a copy
with RLS on and no policies answers nothing to anyone.

The facts it needs (foreign keys, identity and generated columns, RLS) are read by the server when
it runs, and by a part for the preview — the same builder on both sides.

## Gate

On ZKVault: a table with an identity, a generated column, a foreign key and RLS; duplicate with and
without data; compare; drop both.

## Success Criteria

- [ ] The copy has the source's columns, constraints, indexes and foreign keys.
- [ ] With data: the rows match, and the next identity value does not collide.
- [ ] The confirm names what is not copied.
