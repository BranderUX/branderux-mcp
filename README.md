# BranderUX MCP

[BranderUX](https://branderux.com) builds agentic applications, in minutes: describe a
business and a real agent builds its full application, published as a website and an MCP
app, with every screen generated live, per customer, per question. This server is how any
MCP client (Claude, ChatGPT, Cursor, VS Code) builds and controls those applications.

This is the official BranderUX MCP server. It gives an AI agent real control over
BranderUX projects, brand, custom elements, screens, API keys, plus the verified
reference docs it needs to integrate the SDK correctly.

**Connect:** `https://mcp.branderux.com/mcp` · **Docs:** https://branderux.com/mcp

```bash
claude mcp add --transport http branderux https://mcp.branderux.com/mcp
```

No API keys: the first tool call opens your browser for a one-click BranderUX sign-in
(OAuth 2.1 + PKCE, scoped and revocable). Anyone with a BranderUX account connects.
See what it builds: [nova.branderux.app](https://nova.branderux.app) and the five live
examples on [branderux.com](https://branderux.com).

## Tools

**Knowledge** (no scopes needed, signing in is still required to reach the server):
`get_started` · `read_doc` · `search_docs` · `get_integration_snippet` · `list_templates` ·
`get_template`. The `widget` snippet of `get_integration_snippet` is the one-line script tag for a
plain website (Wix, WordPress, Shopify, static HTML), carrying `data-preload="eager"` and
`data-conversions="on"` (new leads, bookings, orders and requests are reported to the tags already
on the site). `list_templates` and `get_template` read the five reference builds as worked
examples to adapt, never to copy.

**Projects** (`projects:*`), for the signed-in user (projects they own or manage): `whoami` ·
`list_projects` · `get_project` · `create_project` · `update_brand_settings` ·
`update_project_settings` · `delete_project`

**Screens** (`projects:write`): `list_screens` · `get_screen` · `put_screen` ·
`delete_screen`, reads fetch the project aggregate; writes are atomic per-screen
(row-locked server merge: parallel saves of different screens are safe).

**Custom elements** (`elements:*`): `list_elements` · `get_element` · `list_element_versions` ·
`create_element` · `publish_element_version` · `preview_element` · `delete_element`, your agent writes the
TSX; the server pre-flight validates it (compile + sandbox import allowlist + export
contract) before publishing. In clients that support MCP Apps, `create_element`,
`publish_element_version` and `preview_element` render the element LIVE in the panel, 
demo props applied, clicks showing the exact query they would send.

**API keys** (`keys:manage`): `create_api_key` · `list_api_keys` · `set_key_origins` ·
`revoke_api_key`

**Hosted agent**: `upsert_agent_config` · `get_agent_config`, give the project
its own agent: persona, policies (language and clock, login, access, handoff, write consent),
answer quality and budgets.

**Business data**: `define_entity` · `list_entities` · `seed_records` ·
`update_record` · `list_entity_records`, managed records or live store/API feeds; every entity
becomes a query tool for the agent (add-only writes by default).

**Owner data** (`projects:read` to read, `projects:write` to change): `query_records` ·
`aggregate_records` · `get_record` · `list_conversations` · `aggregate_conversations` ·
`get_conversation` · `list_visitors` · `get_stats` · `update_record_workflow` · `correct_record` ·
`add_record` · `record_opt_out` · `delete_record` · `reply_links` · `get_crm_status` ·
`send_record_to_crm`, the owner's own AI reads the leads, bookings, orders and requests the hosted
agent collects, with its conversations, signed-in visitors and numbers, and works them one record
at a time: every change is logged on the record (a delete erases the record with its log), visitor
text comes back marked as data, nothing is sent to a customer (`reply_links` prepares a draft the
owner sends), and where customer data goes stays the owner's or a manager's choice in the app.
The `review-my-week` prompt goes through the owner's week or month with these tools. The docs:
`read_doc owner-data`.

**Connectors**: `set_connector_credential` · `probe_api`, vaulted credentials and a
probe so tools are wired against the real API shape.

**Skills**: `upsert_skill` · `list_skills` · `delete_skill`, SKILL.md behavior packs
that ride every conversation.

**Home and fixed screens**: `set_home_screen` · `set_fixed_screens` · `list_fixed_screens` ·
`verify_canned_screens`, a designed first paint and designed answers to the business's recurring
questions, each replayed with live data bindings at zero model cost per visit;
`verify_canned_screens` runs every binding the way serving does, so a screen is proven to replay
before `publish_site`.

**Publish**: `publish_site` · `get_site`, one call and the full application is live:
a website for people, an MCP app for AI agents.

**Playground** (no project needed): `generate_screen`, renders a real branded,
interactive screen in the panel with demo data, powered by the same published
`@brander/mcp-tools` package customers install. Ask for a storefront, analytics
or order-flow screen to see actual BranderUX output before building anything.

Every destructive tool requires an explicit `confirm: true`.

## Local development

```bash
npm install
BRANDER_API_BASE=http://localhost:8080/api/v1 npm run dev   # http://localhost:3010/mcp
```

| Env | Default | Purpose |
|---|---|---|
| `BRANDER_API_BASE` | `http://localhost:8080/api/v1` | BranderUX API base |
| `BRANDER_APP_BASE` | from `BRANDER_API_BASE`: `https://dev.branderux.com` for `api-dev`, `https://branderux.com` for `api`, else `http://localhost:3000` | The BranderUX web app: playground links, canned-screen verification and `query_records` on a live catalog |
| `MCP_RESOURCE_URL` | `http://localhost:3010` | Public URL of this server (OAuth resource id) |
| `OAUTH_ISSUER_URL` | = `BRANDER_API_BASE` | Authorization server issuer |

The server is stateless: one MCP server instance per request, bound to the caller's
bearer. Deploy target is Vercel (`api/mcp.ts` + `api/oauth-protected-resource.ts`).

## License

MIT
