# BranderUX REST API (agent surface)

Base: `https://api.branderux.com/api/v1` (this MCP's tools call it for you — the notes
here explain behaviors you will observe).

## Auth & limits

- Your MCP session carries a scoped agent token (OAuth). Scopes: account:read,
  projects:read/write, elements:read/write, keys:manage.
- Global rate limit: **100 requests/min** per user. 429 responses carry Retry-After —
  pace bulk seeding (a 40-write seed fits comfortably; add small delays if batching more).
- **204 = not found** on reads (the API's convention), surfaced by tools as "not found".
- Ownership is strict: only the project OWNER can manage API keys; collaborators get 403.

## Resource model

- **Project** is the aggregate root: `brandSettings`, `settings`
  (uiGenerationMode, elementVisibility, customPages, flexibleModeRules,
  elementStyleVariant), and `customScreens` all live ON the project. Brand and
  settings are written via PATCH `/projects/{id}`; screens are written via atomic
  per-screen endpoints (PUT/DELETE `/projects/{id}/screens/{screenId}`) — the
  server merges by id under the project row lock, so concurrent screen writes
  are safe. Brand and settings PATCHes are still client-side read-modify-write:
  two agents editing brand/settings on the same project can overwrite each
  other, so keep one agent on those.
- **Custom elements** are real resources under `/projects/{id}/elements` with append-only,
  server-numbered versions. Publishing = element `status: "published"` + a version row.
  The element key is derived server-side from the name.
- **API keys** (`bux_pk_…`): max 2 active per project, raw value shown once at creation,
  origin-allowlisted (exact match, no wildcards), revocation propagates in ~5 minutes.
