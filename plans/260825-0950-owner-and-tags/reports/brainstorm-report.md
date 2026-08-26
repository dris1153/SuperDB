# Brainstorm — user-named Owner, and Label replaced by Tags

Date: 2026-08-25 · Status: design approved, not implemented

## Problem

Two fields on `connections` are not pulling their weight.

**Owner** is derived (`email ?? org_name ?? org_slug`) and on the projects board it renders the same
string as the Organization column right next to it. Pure duplication.

**Label** is a single optional string shown as `(work)` beside the owner. It filters nothing and
groups nothing.

## Requirements

- Owner becomes a name the user sets. Defaults to the organization name at connect time, editable
  afterwards on the Connections page. Identical behaviour for OAuth and access-token connections.
- Label is replaced by Tags. One connection may carry several. The Label input in the token form
  becomes a tag picker.

## Decisions

| Question | Decision | By |
|---|---|---|
| Tag filter on the projects board | Yes, ship with it | user |
| Tag picker UI | Creatable combobox (Command + Popover) | user |
| Tag storage | `text[]` column, not a join table | advisor |

The filter question was the one that justified the whole change: **tags that filter nothing are a
multi-valued Label — strictly more complexity for no functional gain.** With the filter, they group
projects across accounts, which is the product's whole premise.

## Scope note the user should hold in mind

Tags live on the **connection**, so every project under that organization inherits them. Tagging a
single project inside an organization is not possible with this design, and a tag filter behaves like
the Owner filter until several connections share a tag. That is coherent for a tool built around many
Supabase accounts, but it is not per-project tagging and should not be sold as such.

## The trap that matters most

`write()` currently updates every value on conflict:

```ts
existing ? update(row) : insert({ ...row, user_id, kind })
```

`display_name` and `tags` are user-owned data. Left in that object, **re-authorizing an OAuth grant
or re-pasting a token silently resets the name the user chose and wipes their tags.** The failure is
invisible until someone notices their naming is gone.

Fix: split the payload.

- **insert-only** — `display_name`, `tags`
- **always** — sealed secret, `expires_at`, `token_hint`, `org_name`, `org_slug`, `synced_at`,
  `last_error`

`org_name` stays in "always" on purpose: it mirrors upstream and should track renames in Supabase.
`display_name` is the user's, and never moves on its own.

## Storage: `text[]` over a tags table

Normalization earns its keep when tags need colours, descriptions, ordering, rename as a first-class
operation, or existence independent of any connection. None of that was asked for. An array gives
everything the feature actually needs:

```sql
select distinct unnest(tags) from public.connections where user_id = auth.uid();  -- picker source
... where tags @> array['prod']                                                    -- filter, GIN index
update public.connections set tags = array_replace(tags, 'old', 'new');            -- bulk rename
```

One column against two tables, two RLS policies and joins on every read.

## Schema

Added to `create table` for fresh installs, plus guarded `alter`s so an existing database converges to
the same shape:

```sql
display_name text not null
tags         text[] not null default '{}'

create index connections_tags on public.connections using gin (tags);
```

Backfill before dropping `label`:

```sql
update public.connections
   set display_name = coalesce(display_name, email, org_name, org_slug, 'unknown')
 where display_name is null;

update public.connections
   set tags = array[label]
 where label is not null and tags = '{}';

alter table public.connections drop column if exists label;
```

## Code

**`lib/connections.ts`**
- `Connection`: `display_name: string`, `tags: string[]`, `label` removed
- **Delete `ownerLabel()`** — with a real column it is just `c.display_name`. Nine call sites become
  a field access, and the audit path selects `display_name` directly.
- `write()` split into insert-only and always, per the trap above
- `addPatConnection(pat, tags: string[])` — signature changes from `label`
- New `updateConnection(id, { display_name, tags })`
- New `listTags()` — `distinct unnest`, feeds the picker

**`lib/inventory.ts`** — `owner` from `display_name`, `label` → `tags: string[]`

**`components/projects-board.tsx`** — Tags column, tag filter Select (single-select, matching the
existing Owner and Status filters), owner reads `display_name`

**`app/(app)/connections/page.tsx`** — token form takes tags instead of a label; table gains a Tags
column and a per-row Edit button

**New components**
- `tag-picker.tsx` — creatable combobox, Command + Popover, selected tags as chips
- `edit-connection.tsx` — Dialog with name + tags, one save

Requires `pnpm dlx shadcn add popover`. This is the first real use for `command.tsx`, which has sat
unused since the pre-install.

## Risks

| Risk | Mitigation |
|---|---|
| Reconnect wipes user-set name and tags | insert-only split; verify by reconnecting after renaming |
| Tag typos create near-duplicates (`prod`, `Prod`) | picker surfaces existing tags first; normalise to trimmed lower-case on save |
| `display_name` migration leaves nulls | backfill runs before the `not null` constraint |
| Tag filter looks broken with one connection | expected — it only separates anything once tags span connections |

## Success criteria

- Renaming a connection, then re-authorizing it, keeps the new name and its tags
- A tag created in the token form appears in the picker on the next connection
- Selecting a tag on the projects board narrows the table to that connection's projects
- No `label` remains in the schema or the code
- `tsc`, `pnpm test` and `next build` stay clean

## Next steps

1. `pnpm dlx shadcn add popover`, then the focus-ring compliance sed from the shadcn design doc
2. Schema alters + backfill, run against the live database
3. `lib/connections.ts`, then the pages that consume it
4. Tag picker and edit dialog
5. Verify the reconnect-preserves-name case by hand — it is the one thing a build cannot catch
