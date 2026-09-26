# Supabase Storage API Research Report
## For Third-Party Dashboard Implementation

**Date:** 2026-09-25  
**Scope:** Supabase Storage API as of late 2026, primary focus on Management API vs. Storage REST API split  
**Research Status:** Comprehensive, with known gaps flagged

---

## 1. THE SPLIT: Management API vs. Storage REST API

### Management API (api.supabase.com)
**Status: DOCUMENTED**

The Management API provides **minimal** Storage access:

| Operation | Endpoint | Method | Purpose |
|-----------|----------|--------|---------|
| List buckets | `/v1/projects/{ref}/storage/buckets` | GET | Retrieve all project buckets with metadata |
| Get config | `/v1/projects/{ref}/config/storage` | GET | Retrieve storage feature config (limits, enabled features) |
| Update config | `/v1/projects/{ref}/config/storage` | POST | Update storage settings |

**Key limitation:** Management API does **NOT** support:
- Creating buckets
- Deleting buckets
- Updating bucket properties
- Any object operations (list, upload, download, etc.)
- S3 key management

**Authentication:** Management API Personal Access Token (PAT)

### Storage REST API (https://{ref}.supabase.co/storage/v1/...)
**Status: DOCUMENTED**

The Storage REST API provides **full** bucket and object management:

#### Bucket Operations
| Operation | Endpoint | Method | Auth Required |
|-----------|----------|--------|----------------|
| List buckets | `/bucket` | GET | Yes (JWT or key) |
| Create bucket | `/bucket` | POST | Yes |
| Update bucket | `/bucket/{id}` | PUT | Yes |
| Delete bucket | `/bucket/{id}` | DELETE | Yes (only when empty) |
| Empty bucket | `/bucket/{id}/empty` | POST | Yes |

#### Object Operations (simplified paths)
| Operation | Endpoint Pattern | Methods |
|-----------|----------|---------|
| Download | `/object/[public\|authenticated]/{bucket}/*` | GET, HEAD |
| Upload | `/object/{bucket}/*` | POST, PUT |
| List objects | `/object/list/{bucket}` | POST |
| Delete | `/object/{bucket}/*` | DELETE |
| Get metadata | `/object/info/[public\|authenticated]/{bucket}/*` | GET |

**Critical finding:** Dashboard listing buckets via Management API only returns bucket IDs/names. To get full details (public status, file limits, mime types), dashboard must call Storage REST API's `GET /bucket` endpoint.

---

## 2. AUTHENTICATION for Storage REST API

**Status: DOCUMENTED with deprecation caveat**

### Credentials Accepted by Storage REST API

| Credential Type | Where Used | Bypasses RLS? | Notes |
|---------|-----------|---|---------|
| **Service Role Key** | Authorization header as JWT | YES | Deprecated end of 2026; replaced by `sb_secret_xxx` |
| **Publishable Key** (`sb_publishable_xxx`) | NEW; authorization header | NO | Respects RLS policies |
| **Secret Key** (`sb_secret_xxx`) | NEW; authorization header | YES | Replacement for service_role |
| **User JWT** | Authorization header | NO | From Supabase Auth; respects RLS |
| **Management API PAT** | Authorization header | UNKNOWN | See critical gap below |

### Critical Gap: Management API PAT Against Storage REST API
**Status: UNKNOWN** – Research did not find documentation confirming whether a Management API PAT can authenticate directly against the project's Storage REST API (`https://{ref}.supabase.co/storage/v1/...`). 

**Inference:** Likely **NO**, based on:
- Management API and project API are different token systems
- Storage REST API expects project-scoped credentials (service_role/secret/publishable)
- No examples or docs show PAT used for Storage REST operations

**Risk for dashboard:** If dashboard only holds a Management API PAT, it cannot directly call `GET /bucket` on Storage REST API. It must authenticate via a different mechanism.

### RLS Behavior with Service/Secret Role
**Status: DOCUMENTED**

When Storage REST API is called with service_role or secret key (both have BYPASSRLS):
- All RLS policies on `storage.objects` are **ignored**
- Full read/write/delete access to all objects in all buckets
- This is intended for server-to-server operations only

---

## 3. OBJECT LISTING: Request/Response Shape

**Status: PARTIALLY DOCUMENTED**

### Endpoint & Method
```
POST https://{ref}.supabase.co/storage/v1/object/list/{bucketName}
```

### Request Format
**Status: DOCUMENTED in code, sparse in official docs**

Expected request body structure (inferred from SDK and GitHub discussions):
```json
{
  "prefix": "folder/path/",           // Optional: list objects under this prefix
  "limit": 100,                         // Optional: max results per page
  "offset": 0,                          // Deprecated; use cursor-based pagination instead
  "sortColumn": "name",                 // Optional: "name" or "updated_at"
  "sortOrder": "asc",                   // Optional: "asc" or "desc"
  "search": "filename"                  // Optional: substring search
}
```

**Note:** Pagination is transitioning from offset-based (v1) to cursor-based (v2 API).

### Response Format
**Status: DOCUMENTED via SDK, gaps in official REST docs**

```json
{
  "objects": [
    {
      "id": "file-uuid",
      "name": "document.pdf",
      "bucket_id": "my-bucket",
      "owner": "user-id",
      "owner_id": "user-id",
      "metadata": { /* custom JSON */ },
      "updated_at": "2026-09-25T12:00:00Z",
      "created_at": "2026-09-24T10:00:00Z",
      "last_accessed_at": "2026-09-25T11:59:00Z",
      "size": 1024,
      "content_type": "application/pdf"
    }
  ],
  "folders": [
    {
      "name": "subfolder",
      "id": null,
      "updated_at": null,
      "created_at": null,
      "last_accessed_at": null,
      "metadata": null,
      "bucket_id": "my-bucket",
      "owner": null,
      "owner_id": null,
      "size": null,
      "content_type": null
    }
  ],
  "hasMore": true,
  "nextCursor": "base64-encoded-continuation-token"  // For cursor-based pagination
}
```

### How Folders are Represented
**Status: DOCUMENTED**

Supabase Storage has **no real directories**. Folders are a UI illusion:
- Objects have paths like `docs/2024/report.pdf`
- The `path_tokens` field (internal, not in REST response) breaks this into hierarchy
- When listing, the API uses a delimiter (typically `/`) to "fold" objects into virtual directories
- A folder object returned in the response is a synthetic row with mostly null fields
- No way to create directories; they exist only as path prefixes

### Pagination Details
**Status: DOCUMENTED with deprecation note**

- **V1 API:** Uses numeric offset; deprecated
- **V2 API:** Uses opaque base64-encoded continuation tokens
- Token encodes: four fields (exact structure proprietary)
- Dashboard should treat token as opaque string; don't attempt to decode
- Large folders have known issues in older versions; v2 fixes them

---

## 4. UPLOAD AND DOWNLOAD

### Upload
**Status: DOCUMENTED**

#### Standard Upload
```http
POST /object/{bucketName}/{objectPath}
Content-Type: application/octet-stream

<binary data>
```

Or multipart form-data. Supports both.

#### Size Limits
- **Free plan:** 50 MB global limit across all buckets
- **Pro+ plans:** Up to 500 GB global limit
- Per-bucket override possible (must be ≤ global limit)
- Individual file size is the per-bucket limit

#### Resumable Uploads (TUS Protocol)
**Status: DOCUMENTED**

Supabase implements TUS (The Upload Server) for resumable uploads:
- Endpoint: `/upload-tus` on Storage API
- Chunks: 6 MB default chunk size
- Supported by tus-js-client and Uppy libraries
- Browser and server-side both supported
- Automatic retry with configurable delays

#### Server vs. Browser Upload
- **Browser:** Use TUS or standard REST API with publishable/JWT auth; service role must NOT be exposed
- **Server:** Use TUS or REST API with secret key or service role; direct binary stream or multipart

### Download
**Status: DOCUMENTED**

#### Public Download (no auth needed)
```http
GET https://{ref}.supabase.co/storage/v1/object/public/{bucketName}/{objectPath}
```

#### Private Download (requires auth)
```http
GET https://{ref}.supabase.co/storage/v1/object/authenticated/{bucketName}/{objectPath}
Authorization: Bearer <JWT or key>
```

#### Signed URLs (time-limited)
- Generated via SDK or REST endpoint
- Bypass RLS for the duration of signature validity
- Commonly used for private file sharing
- Dashboard can generate and display these

---

## 5. BUCKET TYPES: Files vs. Analytics vs. Vectors

**Status: DOCUMENTED (Analytics and Vectors in Pro+ only)**

### Files Buckets
- **Tier:** Free+
- **Use case:** General-purpose file storage (images, docs, videos)
- **Features:** Direct URL access, CDN, public/private access control
- **Backend:** Traditional object storage in S3-compatible backend
- **API Response:** Standard `bucket` object with `type: "STANDARD"`

### Analytics Buckets (Iceberg Format)
- **Tier:** Pro+ only
- **Use case:** Data lakes, time-series data, data warehouses
- **Features:** 
  - Apache Iceberg table format for querying via SQL
  - Schema evolution, time-travel, immutable history
  - Queryable from Postgres: `SELECT * FROM storage.objects_iceberg`
  - ACID transactions
- **Distinction:** Cannot mix file types; separate from Files buckets
- **API Response:** `bucket` object with `type: "ANALYTICS"`
- **Access:** Via Postgres or Iceberg tools (PyIceberg)

### Vector Buckets
- **Tier:** Pro+ only (private alpha at time of research)
- **Use case:** Embeddings, similarity search, vector databases
- **Features:**
  - Built-in similarity search
  - Query via Postgres with vector functions
  - Semantic matching for RAG, recommendations
- **Distinction:** Separate from Files; stores structured vector data
- **API Response:** `bucket` object with `type: "VECTOR"`
- **Access:** Via Postgres with pgvector extension

### How to Detect Bucket Type Availability
**Status: PARTIALLY DOCUMENTED**

From Management API `GET /v1/projects/{ref}/config/storage`, the response includes:
```json
{
  "features": {
    "image_transformation_enabled": true,
    "s3_protocol_enabled": true,
    "cache_control_enabled": true,
    "iceberg_catalog_enabled": true,    // Indicates Analytics buckets available
    "vector_buckets_enabled": true       // Indicates Vector buckets available (likely)
  }
}
```

**Gap:** Official docs don't explicitly list which config keys indicate Pro+ tier features. Inference from feature names is reasonable but unconfirmed.

---

## 6. S3 PROTOCOL

**Status: DOCUMENTED with caveats**

### Endpoint & Credentials
The S3 protocol is exposed at a separate endpoint:
```
https://{ref}.supabase.co/storage/v1/s3
```

**S3 Access Keys** are generated from the dashboard (Storage > S3 Configuration > Access Keys):
- Generates a pair: `Access Key ID` + `Secret Access Key`
- These are **separate from** project API keys (service_role, publishable, secret)
- Each key can be revoked or regenerated independently

### Authentication Protocol
- Uses **AWS Signature Version 4** (SigV4)
- Clients use standard AWS SDK (aws-sdk-js, boto3, etc.)
- Keys are provisioned at the project level and have **full access across all buckets**
- **Bypasses RLS policies** like service_role does

### Supported S3 Operations
**Status: DOCUMENTED**

Implemented:
- `ListBuckets`, `CreateBucket`, `DeleteBucket`
- `GetObject`, `PutObject`, `DeleteObject`, `CopyObject`
- `ListObjectsV1`, `ListObjectsV2`
- Multipart upload: `CreateMultipartUpload`, `UploadPart`, `CompleteMultipartUpload`, `AbortMultipartUpload`, `ListParts`

**NOT Supported:**
- S3 Versioning (deleted objects cannot be restored)
- Some advanced S3 features (ACLs, object tagging, lifecycle rules)

### Configuration in Dashboard
The S3 Settings tab shows:
- **Endpoint:** `https://{ref}.supabase.co/storage/v1/s3`
- **Region:** Project region (e.g., `us-east-1`)
- **Protocol toggle:** Enable/disable S3 protocol support
- **Access key list:** Create, view, regenerate, delete S3 access keys

**Gap:** No documented REST API endpoint for managing S3 keys (create, list, delete). Must be done via dashboard UI or via storage REST API `POST /s3-access-key` (inferred; unconfirmed).

---

## 7. STORAGE POLICIES (RLS on Storage Tables)

**Status: DOCUMENTED**

### Storage Tables
Policies are written as standard Postgres RLS on two tables:
- **`storage.objects`** – Controls file operations (upload, download, delete, copy, move)
- **`storage.buckets`** – Controls bucket-level operations (usually less common)

### Policy Examples (from Supabase docs)
**Status: DOCUMENTED**

Common templates in dashboard and docs:

```sql
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users can upload to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'my-bucket' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to download their own files
CREATE POLICY "Users can download own files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'my-bucket'
  AND owner_id = auth.uid()
);

-- Allow public bucket access
CREATE POLICY "Public bucket read access"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'public-bucket' 
  AND public = true
);
```

### Helper Functions
**Status: DOCUMENTED**

Supabase provides helper functions for writing policies:
- `storage.foldername(name)` – Extract folder path from object name
- `storage.filename(name)` – Extract just the filename
- `auth.uid()` – Get authenticated user's UUID
- `auth.jwt()` – Access raw JWT claims

### Dashboard Policy Templates
**Status: DOCUMENTED in UI, sparse in official docs**

The dashboard's Storage > Policies tab provides pre-built templates for:
- "Authenticated users only"
- "Only own files" (owner_id = auth.uid())
- "Public read, authenticated write"
- "Specific folder access"

After selecting a template, the dashboard generates the SQL policy automatically.

### Querying via SQL
**Status: DOCUMENTED**

Since `storage.objects` and `storage.buckets` are real Postgres tables (metadata stored in Postgres), dashboard can query them directly via the SQL runner:

```sql
SELECT * FROM storage.buckets;
SELECT * FROM storage.objects WHERE bucket_id = 'my-bucket' LIMIT 10;
SELECT * FROM storage.objects_v2 WHERE bucket_id = 'my-bucket' AND name LIKE 'users/%';
```

**Note:** `storage.objects_v2` may be available on some versions for cursor-based pagination queries.

---

## Summary: Management API vs. Storage REST API Split

| Capability | Management API | Storage REST API | S3 Protocol |
|-----------|---|---|---|
| List buckets | ✅ Partial (list only) | ✅ Full | ✅ (via S3 ListBuckets) |
| Create/update/delete buckets | ❌ | ✅ | ✅ |
| List objects | ❌ | ✅ | ✅ |
| Upload/download | ❌ | ✅ | ✅ |
| Auth: Management PAT | ✅ | ❓ UNKNOWN | ❌ |
| Auth: Service/secret key | N/A | ✅ | ✅ |
| Auth: User JWT | N/A | ✅ | ❌ |
| Resumable uploads (TUS) | ❌ | ✅ | ❌ |
| RLS policies | N/A | ✅ | ❌ (bypassed) |

---

## Key Constraints for Third-Party Dashboard

### 1. **Authentication Gap (Highest Impact)**
Your dashboard authenticates with Management API PAT only. This PAT cannot be used to:
- List buckets in detail (only basic metadata)
- Upload/download files
- Manage S3 keys
- Query storage policies

**Solution:** Dashboard must either:
- Exchange Management PAT for a project service role key (mechanism unclear; see gap below)
- Prompt user to provide project API keys separately
- Use a different auth flow (service account, etc.)

**Unknown:** Can Management API PAT be used to fetch project API keys, or does it require the project's own auth system? Research found no confirmation.

### 2. **S3 Key Management (No REST API)**
**Status: UNKNOWN** – No documented REST API to create/list/delete S3 access keys. Dashboard must either:
- Scrape the dashboard UI (not viable)
- Access S3 keys via SQL if stored in auth schema (unlikely; probably encrypted)
- Direct user to dashboard to manage manually

### 3. **Object Listing Requires REST API**
Management API only lists bucket names. Dashboard must call Storage REST API (`https://{ref}.supabase.co/storage/v1/object/list/{bucket}`) to show file trees. This requires a separate credential chain.

### 4. **Analytics/Vector Bucket Detection Incomplete**
Detecting whether a project supports Iceberg/Vector buckets relies on inferring feature flags from the storage config response. This works but is not officially documented.

### 5. **S3 Protocol Endpoint is Project-Specific**
S3 endpoint (for AWS SDK clients) requires knowing the project ref. This is derivable from Management API project details but adds a dependency.

---

## Research Gaps & Unknowns

1. **Can Management API PAT authenticate against Storage REST API?** – UNKNOWN; affects dashboard auth strategy
2. **Does Management API support S3 key operations?** – UNKNOWN; affects S3 configuration UI
3. **Exact request body for POST /object/list v2 API** – Documented in SDK source, sparse in official docs
4. **Dashboard template policy SQL** – Dashboard generates them, but exact templates not documented
5. **If Management API PAT can be exchanged for project keys** – Mechanism for dashboard key rotation unknown
6. **Upload/download size limits for Analytics/Vector buckets** – May differ from Files bucket limits

---

## Sources Consulted

- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [Management API Reference](https://supabase.com/docs/reference/api/introduction)
- [Storage Access Control Guide](https://supabase.com/docs/guides/storage/security/access-control)
- [S3 Compatibility Guide](https://supabase.com/docs/guides/storage/s3/compatibility)
- [Resumable Uploads (TUS)](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
- [Storage Schema & Design](https://supabase.com/docs/guides/storage/schema/design)
- [supabase/storage GitHub Repository](https://github.com/supabase/storage)
- [storage-js SDK (now in supabase-js monorepo)](https://github.com/supabase/supabase-js)
- [Supabase Blog: Analytics Buckets](https://supabase.com/blog/analytics-buckets)
- [Supabase Blog: Vector Buckets](https://supabase.com/blog/vector-buckets)
- [DeepWiki Supabase Storage Documentation](https://deepwiki.com/supabase/storage)
