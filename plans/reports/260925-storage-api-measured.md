# Supabase Storage, measured

2026-09-25, against `nnjdwpswuynozmzfaioc` with a full-access personal access token. The object
measurements ran against a throwaway bucket created for the purpose and removed afterwards; the
project is back to having no buckets, which is where it started.

Where this disagrees with `260925-storage-research.md`, this wins. It disagrees in three places that
change the design.

## The split, and the credential

The Management API has **three** storage paths. Grepped from the OpenAPI spec, not remembered:

```
GET    /v1/projects/{ref}/storage/buckets      read only
GET    /v1/projects/{ref}/config/storage
PATCH  /v1/projects/{ref}/config/storage       {fileSizeLimit, features, external}
```

There is no bucket create, no bucket delete, no object anything, and **no S3 access key management
at all** — the spec has no path matching `s3` beyond the config flag.

Everything else lives on the project's own Storage API, and that API does not accept the token this
app authenticates with:

```
GET https://{ref}.supabase.co/storage/v1/bucket
  with a service_role key    200
  with a Management API PAT  400 {"statusCode":"403","error":"Unauthorized",
                                  "message":"Invalid Compact JWS","code":"AccessDenied"}
```

So Storage is the first feature in this app that needs a **project** credential rather than an
account one. It can get one: `GET /v1/projects/{ref}/api-keys?reveal=true` returns `service_role`
(or a `secret` key on projects that have migrated), which is what the API keys page already reads.
That key bypasses every Row Level Security policy on `storage.objects`.

## `/config/storage`

```json
{
  "fileSizeLimit": 52428800,
  "features": {
    "imageTransformation": {"enabled": false},
    "s3Protocol": {"enabled": true},
    "purgeCache": {"enabled": false},
    "icebergCatalog": {"enabled": false, "maxNamespaces": 10, "maxTables": 10, "maxCatalogs": 2},
    "vectorBuckets": {"enabled": false, "maxBuckets": 10, "maxIndexes": 5}
  },
  "capabilities": {"list_v2": true, "iceberg_catalog": true, "object_versioning": false},
  "external": {"upstreamTarget": "canary"}
}
```

This one response backs four screens: the Settings tab (`fileSizeLimit`, `imageTransformation`), the
S3 page's toggle (`s3Protocol`), and whether Analytics and Vectors are available at all
(`icebergCatalog`, `vectorBuckets`). `capabilities.list_v2` decides which listing endpoint to use.

### How PATCH merges — three levels, three behaviours

Measured after the first version of this report asserted, without checking, that `features` is
replaced wholesale. It is not.

```
PATCH {fileSizeLimit}                              200  features and external both survive
PATCH {features: {imageTransformation: {...}}}     200  s3Protocol, purgeCache, iceberg all survive
PATCH {features: {icebergCatalog: {enabled}}}      400  features.icebergCatalog.maxNamespaces:
                                                        Invalid input: expected number, received undefined
```

- **Top level merges.** A field not sent is left alone.
- **`features` merges by key.** A feature not sent is left alone.
- **A feature sub-object is validated in full.** Send one and it must carry every field that
  feature has. `imageTransformation` and `s3Protocol` have only `enabled`, so they are one field;
  `icebergCatalog` and `vectorBuckets` also carry `max*` limits and will be **refused** without them.

So a caller cannot silently clear a flag by omitting it — the failure mode is a 400 naming the
missing field, which is the safe direction. Code does not need to read-merge-write; it needs to send
whole sub-objects.

## Buckets

`POST /bucket` takes `{id, name, public, file_size_limit, allowed_mime_types}` and answers **`{name}`
alone** — not the created bucket. The full shape comes from a follow-up read:

```json
{"id": "...", "name": "...", "owner": "", "public": false,
 "file_size_limit": 1048576, "allowed_mime_types": ["text/plain", "image/png"],
 "created_at": "...", "updated_at": "..."}
```

`GET /bucket` (the list) adds `"type": "STANDARD"`; `GET /bucket/{id}` does **not** include it. So
the bucket type — the thing separating Files from Analytics and Vectors — is only visible in the
list.

**Deleting a bucket that still holds objects is refused**, 400 with `{"statusCode":"409",
"error":"ResourceNotEmpty"}`.

**`POST /bucket/{id}/empty` is asynchronous**, and says so:

> Empty bucket has been queued. Completion may take up to an hour.

A UI that empties and then deletes will fail the delete. Deleting the objects directly and then the
bucket works immediately, which is what the cleanup ended up doing.

## Listing: two endpoints with different shapes

This is where the research was wrong, and it is the heart of the file explorer.

**`POST /object/list/{bucket}`** with `{prefix, limit, sortBy: {column, order}, search}` returns a
**bare array**, not an envelope. One level at a time. A folder is an entry whose fields are all
`null` except its name:

```json
[
  {"name": "hello.txt", "id": "b995a0c5-…", "metadata": {"size": 20, "mimetype": "text/plain", …}},
  {"name": "notes",     "id": null,         "metadata": null}
]
```

That null `id` is the only thing separating a folder from a file, and folders are synthetic —
`notes` exists because an object is named `notes/deep/second.txt`, not because anything created it.

**`POST /object/list-v2/{bucket}`** returns an envelope **and is flat**:

```json
{"hasNext": false, "folders": [],
 "objects": [{"name": "hello.txt", …}, {"name": "notes/deep/second.txt", …}]}
```

Its `name` is the whole path. So the two endpoints are not versions of each other: v1 walks a tree
one level at a time, v2 enumerates everything. A file browser wants v1; deleting a bucket's contents
wants v2, because one call finds every object however deeply nested.

`search` filters by substring on the name within the prefix.

## Upload, download, signing

```
POST /object/{bucket}/{path}   200  {"Key": "bucket/path", "Id": "uuid"}
```

The two bucket restrictions are enforced server-side and their errors are specific:

```
415  {"error":"invalid_mime_type","message":"mime type application/json is not supported"}
413  {"error":"Payload too large","message":"The object exceeded the maximum allowed size"}
```

Both arrive as HTTP **400** with the real status in the body, the same shape the rest of this API
uses.

- `GET /object/authenticated/{bucket}/{path}` returns the bytes.
- `GET /object/public/{bucket}/{path}` on a **private** bucket answers `NoSuchBucket`, not
  "forbidden" — it does not admit the bucket exists.
- `POST /object/sign/{bucket}/{path}` with `{expiresIn}` returns a **relative** URL:
  `{"signedURL": "/object/sign/{bucket}/{path}?token=…"}`. The origin has to be prepended.
- `POST /object/move` takes `{bucketId, sourceKey, destinationKey}`.
- `DELETE /object/{bucket}` takes `{prefixes: [...]}` and returns the rows it removed.

## What cannot be built

**S3 access keys.** The S3 Configuration screen lists them and offers "New access key". No endpoint
in the Management API spec backs either, and they are not project API keys. Same shape of limitation
as the legacy JWT secret's Reveal: the rest of that screen — the protocol toggle, the endpoint, the
region — is all available.

## Unmeasured

- Whether `service_role` still works on a project that has disabled legacy API keys, where only a
  `secret` key exists. The code should try `service_role` then `secret`, which is what the probe did.
- TUS resumable upload. Not needed until uploads get large enough that a single request will not do.
- Analytics and Vector buckets. Both flags are `false` on this project and both are Pro-only, so
  there was nothing to create.

## Uploading without handing the browser a key

Measured after the first pass, because it decides how the file explorer is built.

```
POST /object/upload/sign/{bucket}/{path}   200  {"url": "/object/upload/sign/…?token=…", "token": "…"}
PUT  {origin}/storage/v1{url}              200  {"Key": "bucket/path"}
```

The `PUT` carried **no `authorization` header at all** and succeeded. The token's payload is
`{url, upsert: false, scope: "upload", iat, exp}` with `exp - iat = 7200` — two hours.

So the server signs, the browser uploads, and `service_role` never leaves the server. That also
sidesteps the request body limit a Next route handler would impose on a proxied upload.

`OPTIONS /upload/resumable` answers 200, so TUS exists for files too large for one request. Not
measured further; one request is enough until it is not.

The probe bucket was removed and the project has no buckets again.
