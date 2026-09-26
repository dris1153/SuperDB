# The user sheet: three complaints, four causes

Screenshot compared 2026-09-26, with the measurements behind each.

## 1. The tabs touch the border

The tab strip is `px-6 pt-4` directly on a `border-b` container, so the pills sit on the rule and
next to the close control with nothing between. Spacing, and room kept clear for the X.

## 2. The sheet is 384px, and the class that was supposed to widen it never applied

`components/ui/sheet.tsx` carries the width as a variant:

```
data-[side=right]:sm:max-w-sm      base, 384px
sm:max-w-2xl                       what the panel asked for, 672px
```

`tailwind-merge` treats those as different groups — one is prefixed by a `data-*` variant, the other
is not — so it keeps both, and the base wins. The panel has been 384px the whole time; every long
value truncates and `User UID` wraps onto two lines.

The repo already has the fix, in `components/connect-sheet.tsx`: `sm:max-w-4xl!`. The `!` is what
beats the variant. Same width chosen here, so the two sheets agree.

Truncation goes as well: with 896px the labels fit on one line and a UUID and a full timestamp both
fit beside them.

## 3. "User detail loads slowly" — two different things

### Upstream is not slow

Every call the panel depends on, three runs each, from Vietnam:

| Call | median |
|---|---|
| `GET /v1/projects/{ref}` (resolve) | 216 ms |
| `GET /v1/projects/{ref}/api-keys?reveal=true` (project key) | 144 ms |
| `GET /admin/users/{id}` | 245 ms |
| `GET /admin/users/{id}/factors` | 240 ms |

Warm, the chain is about 600 ms. That is not what "lâu quá" describes.

### The perceived half: the panel throws away what the table already has

The row that was clicked carries the id, the email, the display name, the avatar, `created_at` and
`last_sign_in_at`. The panel renders a full skeleton anyway and waits ~600 ms to show any of it.

Seeding from the row costs no request. Four attributes, the identities and the factors are all that
genuinely need the read.

### The real half: the route is 12.7 MB, and 10.4 MB of it is for another reader

`/api/projects/[ref]/[part]` is the endpoint every card and this panel call. It traces:

```
12.7 MB, 588 files     of which Shiki: 10.4 MB, 372 files
```

`lib/project-parts.ts` imports `highlight` for **one** reader — `definition`, which colours table
DDL server-side. Measured by removing that import and rebuilding:

```
2.0 MB, 107 files
```

An 84% cut on the route, and it was reverted after measuring. On a cold lambda that difference is
fetched and unpacked before any panel data moves, and
[the cold-start plan](../260926-0153-cold-start/plan.md) measured cold starts of 31 s and 59 s on
this deployment.

Note what this does **not** claim: that route size *is* the cold start. `/login` traces 2.1 MB and
was 31 s. It is one term, measured, and the only one visible from here.

## Decisions

- **SQL is coloured in the browser.** A tokeniser of about forty lines in `lib/`, tested like
  `lib/json-line.ts`, with the server returning plain DDL. Chosen over giving `definition` its own
  route, which would put an exception into the uniform part mechanism, and over dropping the colour.
- **896px**, matching `connect-sheet.tsx`.
- **The panel seeds from the row**, which is a rendering change and not another request.

## Risks

- **A SQL tokeniser is easier to get wrong than a JSON one.** Strings, dollar-quoting, comments and
  identifiers with quotes in them all appear in real DDL. Same discipline as `json-line`: it holds
  to reassembly — the tokens must join back into the original text, character for character.
- **`CodeBlock` stays as it is.** The connect guides keep server-side Shiki; they are on other
  routes and their snippets are not SQL.
