---
phase: 3
title: "The file explorer"
status: completed
priority: P2
effort: "2d"
dependencies: [2]
---

# Phase 3: The file explorer

## Overview

Inside a bucket: browse, upload, download, share a link, delete. The largest phase in the feature.

## Requirements

- Browse a bucket one level at a time, with a breadcrumb back to the root.
- Upload files, including into the folder currently open.
- Preview an image; show type, size and dates for anything else.
- Download, copy a URL, delete.
- Create a folder, understanding that folders are not real.

## Architecture

**Folders do not exist.** Measured: `notes` appears in a listing only because an object is named
`notes/deep/second.txt`. `/object/list` returns a **bare array** — not an envelope — and a folder is
an entry whose every field is `null` except `name`:

```json
[{"name": "hello.txt", "id": "b995a0c5-…", "metadata": {"size": 20, …}},
 {"name": "notes",     "id": null,         "metadata": null}]
```

`id === null` is the only thing separating the two, and that predicate belongs in a tested function
rather than inline in a component.

"Create folder" therefore creates nothing until a file is put in it. The UI holds an empty folder
locally and it disappears on reload — the original behaves the same way, and the page should not
imply otherwise.

**Uploading does not go through this server.** `POST /object/upload/sign/{bucket}/{path}` returns a
URL that accepts a `PUT` with **no authorization header** — measured. The action signs, the browser
uploads directly, and `service_role` stays on the server. It also avoids the body limit a proxied
upload would meet. The token lasts two hours.

The two bucket restrictions are enforced upstream and their errors are specific enough to show:
`invalid_mime_type` names the type, `Payload too large` names the limit.

**Reading.** Not proxied — see "What was built differently". `POST /object/sign` mints a temporary
link for a private object and returns a **relative** URL that needs the origin prepended; a public
bucket's URL needs no signature at all. Which of the two applies is decided on the server by reading
the bucket, not by a flag from the browser.

**Deleting** takes `{prefixes: [...]}` and returns the rows it removed, so the UI can report a count
rather than assuming.

## Related Code Files

- Create: `app/(app)/p/[ref]/storage/b/[bucket]/page.tsx`
- Create: `components/storage/file-browser.tsx`, `file-details.tsx`, `upload-drop.tsx`
- Create: `lib/storage-objects.ts` (+ test) — the folder predicate, path joining, breadcrumbs
- Create: `lib/object-actions.ts` — sign upload, sign download, delete, move
- Create: `app/api/projects/[ref]/storage/object/route.ts` — the proxied read for private objects

## Implementation Steps

1. Measure `POST /object/upload/sign` once more against a throwaway bucket before building on it.
   (Done for this plan; repeat if the phase starts much later.)
2. `lib/storage-objects.ts`: `isFolder`, `joinPath`, `breadcrumbs`, and a formatter for the details
   panel. Pure, tested, including the `id: null` rule and a name containing a slash.
3. An `objects` part taking bucket and prefix, reading `/object/list` with a sort and a search.
4. The three-column layout from the original: a list, a preview area, a details panel that closes.
5. Upload: sign, `PUT` from the browser, refetch. Progress per file; errors reported per file, since
   one rejected MIME type must not fail the rest.
6. The proxied read route for private objects, with the object's own content type, and a hard cap on
   what it will stream.
7. Download, Get URL (signed for private, public for public), Delete with a confirm.
8. Create folder as a local-only affordance, labelled honestly.
9. Verify.

## Success Criteria

- [x] Browsing enters and leaves folders and the breadcrumb matches.
- [x] An image previews; a PDF does not pretend to.
- [x] Upload works for several files at once and reports per-file failures.
- [x] A rejected MIME type or an oversized file says which rule it broke — the API's own message is
      parsed out of the body and shown against that file.
- [x] Deleting reports how many objects were removed, from the rows the API returned.
- [x] No response to the browser contains the project key.
- [x] `pnpm typecheck && pnpm test && pnpm lint && pnpm build` green — 479 tests.

## Risk Assessment

- **Deleting is irreversible and there is no undo in Storage.** Confirm names the object, or the
  count when there are several.
- **A bucket with thousands of objects.** `/object/list` takes a limit and the listing is capped
  at 200. There is **no pager**: a folder that comes back full says so, rather than implying it is
  complete. Paging through thousands of objects is not something a settings page should invite.
- **A signed upload URL is a capability.** Two hours, one path, upload scope only — but it is handed
  to the browser, so it is minted per file at the moment of upload rather than in advance.

## What was built differently

**No proxy route.** The plan called for a route handler streaming private objects through this
server. There is no need: `POST /object/sign` mints a URL the browser can read directly, expiring
in an hour, and a public bucket's URL needs no signature at all. Proxying would have meant every
preview and every download crossing this process, for nothing — the key is not involved either way.

**`FileDetails` is remounted by `key`, not reset by effect.** Selecting another file gives it a new
`key` of the object's path, so its signed URL and its delete confirm belong to the file on screen.
Clearing four pieces of state inside an effect was the first version, and the lint rule against
`setState` in an effect was right about it.

**Create folder was dropped.** A folder in Storage exists only while an object is named through it
— measured — so a "create folder" button makes something that vanishes on reload. The empty state
says this instead: upload a file to make the folder exist. That is more honest than an affordance
that appears to work.

**Rename is present in the action layer and not in the UI.** `renameObject` exists because moving is
the only way Storage renames anything, and the file browser has nowhere sensible to put it yet.

## What the measurements decided

- **A folder is `id === null`.** Nothing else distinguishes one; a zero-byte file has metadata and a
  folder has none, so size cannot be the test. Pinned in `lib/storage-objects.test.ts`.
- **`/object/list` walks one level; `/object/list-v2` is flat.** The browser uses v1 and the bucket
  drain uses v2 — they are not versions of each other.
- **The browser uploads directly.** `POST /object/upload/sign` returns a URL that takes a `PUT` with
  no `authorization` header, measured. So `service_role` stays on the server and the upload never
  meets a route handler's body limit.
- **Signed URLs come back relative.** `{"signedURL": "/object/sign/…?token=…"}` — the origin has to
  be prepended, and forgetting would produce a link to this app instead of to Storage.
- **`DELETE /object/{bucket}` returns the rows it removed**, so "deleted 3 files" is counted rather
  than assumed, and a delete that removed nothing says so.

## What review caught

**The route param was decoded twice.** Next percent-decodes a dynamic param before handing it over
— confirmed in `next/dist/shared/lib/router/utils/route-matcher.js` — so decoding again turned a
bucket named `my%20bucket` into `my bucket`, opening a *different* bucket and rendering "This folder
is empty". A name containing a bare `%` was worse: `decodeURIComponent` throws `URIError` inside an
async server component, which is an uncaught 500 reachable from a crafted URL. Bucket names are
measured as near-unrestricted, so both were live.

**The signed URL's lifetime was whatever the browser asked for.** `objectUrl` took `expiresIn` with
a TypeScript default, and a `"use server"` export is an endpoint: a caller could mint a ten-year
bearer URL for any object they can reach. That URL outlives the session, the OAuth grant and the
connection — revoking any of them does nothing to a link already handed out. Clamped to an hour on
the server.

**`isPublic` was taken on trust from a client-side cache**, and it decides between a link that
expires and one that never does. The server reads the bucket now.

**Signing was audited as if it were a write, once per file.** The object does not exist until the
browser's PUT lands, and `recordWrite` drops the project's part cache — for every user — on each
call. The entry that cache exists to protect is `metrics`, whose upstream limit is a measured ten
requests a minute, so uploading eleven files flushed it eleven times and sent anyone with the
overview open into 429s. One audit line per batch now, written when the uploads finish.

**Three comments and the risk section claimed a pager that does not exist.** A folder with 201
objects silently showed 200 and looked complete. It says so now.

Smaller, same pass: `encodePath` refuses `..` itself rather than relying on the caller having
checked; the objects reader validates its bucket, bounds its prefix and search, and picks fields
instead of passing the body through; the search input is deferred and keeps the previous list on
screen instead of flashing a skeleton per keystroke; the details panel is derived from the listing
rather than captured at click time, so it cannot describe a file that has since changed; an unknown
bucket says so instead of rendering as an empty folder; the nav keeps Files highlighted inside a
bucket; and `parentPrefix` was deleted, having been exported and tested but never called.

## Known gap

**No overwrite.** `signUpload` sends no `upsert`, so re-uploading a name that exists fails per file
with the API's "resource already exists". Uploading a corrected version of a file is the second
thing anyone tries; it needs the `x-upsert` header measured before it is offered, because a silent
overwrite on a path with no undo is worse than a refusal.

## The loading state, after seeing it

Reported from a screenshot: opening a file showed an empty panel with a Download button whose icon
had wrapped onto its own line. Two separate causes.

**The button was the same button, disabled.** `asChild` needs exactly one element child, so the
pending branch wrapped the icon and the label in a `<span>` — which became the flex item, and the
two wrapped. It is a plain disabled button now, reading "Preparing…", with the layout it will have
once the link lands.

**Nothing marked the wait.** The signed URL arrives one round trip before the bytes do, so even
rendering the image as soon as the link existed would have shown a broken-image glyph for as long
as the image took. The preview now holds a skeleton until the image itself has decoded, and a
preview that fails — an expired signature, or a file whose type claims image and whose bytes do
not — says so in a sentence instead of showing a broken glyph.
