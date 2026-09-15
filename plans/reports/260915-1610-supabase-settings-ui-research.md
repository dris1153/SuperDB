# Supabase Project Settings UI Research
**Date:** 2026-09-15 | **Time:** 16:10  
**Scope:** Project Settings structure, sections, endpoints, and UI layout

---

## SECTION-TO-ENDPOINT MAPPING (Primary Deliverable)

| Settings Section | Primary Endpoint | Operation | Verified | Notes |
|---|---|---|---|---|
| **General** | `PATCH /v1/projects/{ref}` | Update project name | ✓ | Also shows: Project ID, Region, Transfer, Delete |
| **Infrastructure** | `GET /v1/projects/{ref}` | Read infra details | ✓ | Shows compute size, service versions, activity |
| **Infrastructure** | `PATCH /v1/projects/{ref}/billing/addons` | Update compute size | ✓ | Addons/upsizing managed here |
| **Infrastructure** | `GET /v1/projects/{ref}/billing/addons` | List available addons | ✓ | Returns current & available options with pricing |
| **Infrastructure** | `POST /v1/projects/{ref}/restart` | Restart project | ✓ | Restart endpoint confirmed |
| **Infrastructure** | `POST /v1/projects/{ref}/pause` | Pause project | ✓ | Free tier auto-pause, manual pause available |
| **Infrastructure** | `POST /v1/projects/{ref}/restore` | Resume paused project | ✓ | Inverse of pause; has 1-year recovery window |
| **Domains** | `POST /v1/projects/{ref}/custom-hostname/initialize` | Setup custom domain | ✓ | Config, DNS verification, SSL certs |
| **Domains** | `GET/POST /v1/projects/{ref}/custom-hostname` | Read/update hostname config | ✓ | Vanity subdomains also available (experimental) |
| **API Settings** | `GET /v2/projects/{ref}/config` | Read project-wide config | ✓ | Database, pooler, Auth, Data API, Realtime, Storage |
| **API Settings** | `GET /v1/projects/{ref}/postgrest` | Read PostgREST config | ✓ | REST API schema/table exposure |
| **Database** (nested in Database service, not Settings) | `PATCH /v1/projects/{ref}/database/password` | Reset DB password | ✓ | Located under Database → Settings, not Project Settings |
| **Database** (nested in Database service) | `GET /v1/projects/{ref}/config/database/postgres` | Read Postgres config | ✓ | Moved out of Project Settings to Database → Configuration |
| **Database** (nested in Database service) | `PUT /v1/projects/{ref}/config/database/postgres` | Update Postgres config | ✓ | Cache, memory, connection limits, etc. |
| **Team** | `GET /v2/organizations/{slug}/members` | List team members | ✓ | Organization-scoped, not project-scoped |
| **Team** | `POST /v2/organizations/{slug}/members/invite` | Invite team member | ✓ | Role assignment with optional project scope |
| **Team** | `PATCH /v2/organizations/{slug}/members/{user_id}/roles` | Update member role | ✓ | Org-wide or project-scoped role assignment |
| **Billing** | `GET /v1/organizations/{slug}/billing` | Read billing info | ✗ | **Not verified** — likely exists but endpoint unclear |
| **Billing** | `GET /v1/organizations/{slug}/invoices` | Read invoices | ✗ | **Not verified** — organization-scoped, not project |
| **Usage** | `GET /v1/analytics/...` | Read usage metrics | ✗ | **Not verified** — likely exists but endpoint unclear |
| **Integrations** | `GET /v1/projects/{ref}/integrations/tpa` | List TPA integrations | ✓ | Third-party app integrations (GitHub, etc.) |
| **Integrations** | `GET /v1/projects/{ref}/integrations/tpa/{id}` | Get single TPA integration | ✓ | Retrieve specific integration details |

---

## VERIFIED FINDINGS

### Sections Shown in Supabase Dashboard Project Settings

From direct URL patterns and documentation, the following sections exist under `/p/[ref]/settings/`:

1. **General** (`/settings/general`)
   - Project name, ID, region, transfers, lifecycle (pause/delete)
   - Single endpoint: `PATCH /v1/projects/{ref}` for name updates

2. **Infrastructure** (`/settings/infrastructure`)
   - Compute size (affects billing addons)
   - Service versions (Postgres, PostgREST, GoTrue, etc.)
   - Infrastructure activity/logs
   - Endpoints: Addons (list/update), restart, pause, restore

3. **API Settings** (`/settings/api`)
   - Project URL, Data API setup/toggles
   - Endpoint: `GET /v2/projects/{ref}/config` (umbrella config including Auth, Realtime, Storage, etc.)

4. **Domains** (`/settings/domains`)
   - Custom domains setup
   - Vanity subdomains (marked experimental)
   - Endpoints: Custom hostname init/update, DNS verification tracking

5. **Team** (`/settings/team`)
   - Organization members list
   - Add/remove team members, role assignment
   - **Organization-scoped, not project-scoped**
   - Endpoints: Member list, invite, role assignment under `/v2/organizations/{slug}`

6. **Integrations** (`/settings/integrations`)
   - Third-party OAuth integrations (GitHub, etc.)
   - Endpoints: List/get TPA integrations

7. **Billing** (likely `/settings/billing`, inferred from dashboard URLs)
   - Subscription plan, payment method, invoices
   - **Organization-scoped, not project-scoped**
   - Endpoints: **Not definitively found** — likely under `/v1/organizations/{slug}/billing`

8. **Usage** (likely exists, inferred from search results mentioning "Usage" tab)
   - **Organization or project metrics**
   - **Endpoints: Unverified** — likely analytics endpoints but unclear path

### Database Password Reset

**Location in actual Supabase dashboard:** Database → Settings (not Project Settings)

**UI Flow:**
- Navigate to Database service
- Click Settings tab within Database
- Find "Reset Database Password" section
- Action generates confirmation dialog
- New password shown once (user must copy)
- Temporary connection failures (28P01) expected post-reset via pooler
- Endpoint: `PATCH /v1/projects/{ref}/database/password`

**Key deviation noted:** This app stores encrypted password in Password Manager page instead of showing it once. This is a deliberate architectural choice, not accidental.

### Project Restart/Pause/Resume

**Endpoints verified:**
- `POST /v1/projects/{ref}/restart` — Restart the project
- `POST /v1/projects/{ref}/pause` — Pause project (free tier auto-pauses after 7 days inactivity)
- `POST /v1/projects/{ref}/restore` — Resume paused project (1-year recovery window)

**UI Location:** Infrastructure → Project Availability section  
**Screenshot confirms:** "Restart project" button shown (user supplied screenshot)

### UI Layout Structure

**Second-level navigation uses left sidebar within content area:**
- Main sidebar (left edge of page) = primary service nav (Database, Auth, Storage, etc.)
- Settings sections are **sub-tabs or left sidebar within the settings page itself**
- Navigation happens via tabs OR left-column links depending on screen size
- **Exact behavior:** Not fully confirmed from single source, but discussion #37655 indicates tabs and redirects in place of unified sidebar

---

## UNVERIFIED / GAPS

| Item | Reason |
|---|---|
| **Billing endpoints** | Search results reference organization-scoped billing but exact endpoint paths not found in official docs fetched |
| **Usage/Analytics endpoints** | Mentioned in searches but no specific `/v1/projects/{ref}/analytics` or similar endpoint documented |
| **Organization settings endpoints** | `PATCH /v2/organizations/{slug}` not definitively found; may exist for org name/branding but unconfirmed |
| **Exact UI layout (tabs vs sidebar)** | Discussed in navigation update threads but not explicitly documented in current schema |
| **Data API vs PostgREST config separation** | Both exist but relationship/hierarchy unclear in newer UI |

---

## DECISION POINTS FOR CLONE

**Greyed-out entries must map to confirmed endpoints.** Based on this research:

### Safe to list (endpoint confirmed):
- ✓ General
- ✓ Infrastructure
- ✓ Domains
- ✓ API Settings
- ✓ Team (if showing org-level teams)
- ✓ Integrations

### Uncertain/needs clarification:
- ? Billing (endpoint path unclear)
- ? Usage (no endpoint found)
- ✗ Database Password (should not be in Settings sub-nav; belongs under Database service)
- ✗ Database Config (belongs under Database service, not Settings)

### Navigation reorganization impact:
**As of Jan 2026**, Supabase moved Database, Auth, Storage, Edge Functions, and Log Drains OUT of Project Settings into their own service sections. Project Settings now holds:
- Project metadata (General, Infrastructure, Domains)
- Cross-cutting concerns (API Settings, Team, Integrations)
- Billing/Usage (organization level, not project)

**Implication for clone:** If building project-scoped UI without organization concept, omit Team and Billing entirely. They belong at org level.

---

## SOURCES

- [Supabase Management API Reference — Introduction](https://supabase.com/docs/reference/api/introduction)
- [Update a Project endpoint](https://supabase.com/docs/reference/api/v1-update-a-project)
- [Restart a Project endpoint](https://supabase.com/docs/reference/api/v1-restart-a-project)
- [Pause a Project endpoint](https://supabase.com/docs/reference/api/v1-pause-a-project)
- [Update Database Password endpoint](https://supabase.com/docs/reference/api/v1-update-database-password)
- [How to Reset Database Password — Troubleshooting guide](https://supabase.com/docs/guides/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB)
- [Custom Domains Guide](https://supabase.com/docs/guides/platform/custom-domains)
- [Update Hostname Config endpoint](https://supabase.com/docs/reference/api/v1-update-hostname-config)
- [List Project Addons endpoint](https://supabase.com/docs/reference/api/v1-list-project-addons)
- [Dashboard Navigation Updates Discussion #37655](https://github.com/orgs/supabase/discussions/37655)
- [Access Control Guide](https://supabase.com/docs/guides/platform/access-control)
- [List Organization Members endpoint](https://supabase.com/docs/reference/api/v2-list-organization-members)
- [Get PostgreSQL Config endpoint](https://supabase.com/docs/reference/api/v1-get-postgres-config)
- [Get Project Config endpoint](https://supabase.com/docs/reference/api/v2-get-project-config)
- [OpenAPI Specification](https://api.supabase.com/api/v1-json)

---

## UNRESOLVED QUESTIONS

1. **Billing endpoints exact paths** — `GET /v1/organizations/{slug}/billing` and `/invoices` inferred but not verified in current API docs
2. **Usage/Analytics endpoint** — Whether it's `/v1/projects/{ref}/analytics` or under organization, unclear
3. **Organization settings PATCH** — Whether `PATCH /v2/organizations/{slug}` exists for updating org name, branding, unverified
4. **Settings page render order** — Order of tabs/sections in actual UI (General first, then Infrastructure, then Domains, etc.) not explicitly confirmed
5. **Data API endpoint scope** — Whether Data API config lives under project config or separate; relationship to PostgREST config unclear

---

## RECOMMENDATION FOR PLAN

**Lead with the mapping table.** Use it to decide which sub-nav rows get listed:

1. **List these rows (endpoints confirmed):**
   - General
   - Infrastructure
   - Domains
   - API Settings
   - Integrations

2. **Omit unless clarified:**
   - Billing (organization-scoped; no endpoint found)
   - Usage (no endpoint found; likely organization/analytics)
   - Team (organization-scoped, not project-scoped)

3. **Never list as greyed "coming soon":**
   - Database Password (belongs in Database service, not Settings)
   - Auth Config, Storage Config, etc. (moved to their own service sections in Jan 2026)

**This ensures every row the clone shows names a working endpoint, per your rule.**


---

# Correction, verified 2026-09-15 against the spec

Every path this report named was looked up in `https://api.supabase.com/api/v1-json`. Two do not
exist, and two that matter do.

| Path | Verdict |
|---|---|
| `POST /v1/projects/{ref}/restart` | **exists** |
| `POST /v1/projects/{ref}/pause` | **exists** |
| `GET,POST /v1/projects/{ref}/restore` | exists (already used by `lib/mgmt-api.ts`) |
| `POST /v1/projects/{ref}/custom-hostname/initialize` | exists |
| `GET,PATCH /v1/projects/{ref}/postgrest` | exists |
| `GET,PUT /v1/projects/{ref}/config/database/postgres` | exists |
| `GET,PATCH /v1/projects/{ref}/config/auth` | exists |
| `GET,PATCH /v1/projects/{ref}/config/storage` | exists |
| `GET,PUT /v1/projects/{ref}/ssl-enforcement` | exists |
| `GET,PATCH /v1/projects/{ref}/network-restrictions` | exists |
| `GET /v2/projects/{ref}/config` | **does not exist** |
| `GET /v1/projects/{ref}/integrations/tpa` | **does not exist** |

Two consequences.

**Project availability is buildable.** Restart and pause both have endpoints, so the "Project
availability" card in the reference screenshot is not a greyed row — it is a phase somebody can pick
up. Worth noting that `restore` is already wired in this repo for resuming a paused project.

**Integrations still has nothing behind it**, which independently confirms the call
`components/project-nav.tsx:22` made when it refused to list that row in the main nav. The same
reasoning removes it from the settings sub-nav.

## The sub-nav this settles

Listed, because each names a real endpoint:

| Row | Endpoint | State |
|---|---|---|
| General | `PATCH /v1/projects/{ref}` | live |
| Password Manager | `PATCH /v1/projects/{ref}/database/password` | live |
| Infrastructure | `restart`, `pause`, `restore`, `billing/addons` | soon |
| Database | `config/database/postgres`, `ssl-enforcement`, `network-restrictions` | soon |
| API | `postgrest` | soon |
| Auth | `config/auth` | soon |
| Storage | `config/storage` | soon |
| Domains | `custom-hostname/initialize` | soon |

Omitted entirely: **Integrations** (no endpoint), and **Billing / Usage / Team** (organization-scoped,
and this app has no organization concept — every user sees only their own connections).
