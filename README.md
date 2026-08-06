# BranderUX MCP

The official [BranderUX](https://branderux.com) MCP server. It gives an AI agent real
control over BranderUX projects — brand, custom elements, screens, API keys — plus the
verified reference docs it needs to integrate the SDK correctly.

**Connect:** `https://mcp.branderux.com/mcp` · **Docs:** https://branderux.com/mcp

```bash
claude mcp add --transport http branderux https://mcp.branderux.com/mcp
```

No API keys: the first tool call opens your browser for a one-click BranderUX sign-in
(OAuth 2.1 + PKCE, scoped and revocable). Access is currently limited to design
partners — everyone else lands on the waiting list.

## Tools

**Knowledge** (no scopes needed — signing in is still required to reach the server):
`get_started` · `read_doc` · `search_docs` · `get_integration_snippet`

**Projects** (`projects:*`): `whoami` · `list_projects` · `get_project` ·
`create_project` · `update_brand_settings` · `update_project_settings` · `delete_project`

**Screens** (`projects:write`): `list_screens` · `get_screen` · `put_screen` ·
`delete_screen` — custom screens live on the project aggregate; these tools do the
read-modify-write for you.

**Custom elements** (`elements:*`): `list_elements` · `get_element` · `create_element` ·
`publish_element_version` · `preview_element` · `delete_element` — your agent writes the
TSX; the server pre-flight validates it (compile + sandbox import allowlist + export
contract) before publishing. In clients that support MCP Apps, `create_element`,
`publish_element_version` and `preview_element` render the element LIVE in the panel —
demo props applied, clicks showing the exact query they would send.

**API keys** (`keys:manage`): `create_api_key` · `list_api_keys` · `set_key_origins` ·
`revoke_api_key`

Every destructive tool requires an explicit `confirm: true`.

## Local development

```bash
npm install
BRANDER_API_BASE=http://localhost:8080/api/v1 npm run dev   # http://localhost:3010/mcp
```

| Env | Default | Purpose |
|---|---|---|
| `BRANDER_API_BASE` | `http://localhost:8080/api/v1` | BranderUX API base |
| `MCP_RESOURCE_URL` | `http://localhost:3010` | Public URL of this server (OAuth resource id) |
| `OAUTH_ISSUER_URL` | = `BRANDER_API_BASE` | Authorization server issuer |

The server is stateless: one MCP server instance per request, bound to the caller's
bearer. Deploy target is Vercel (`api/mcp.ts` + `api/oauth-protected-resource.ts`).

## License

MIT
