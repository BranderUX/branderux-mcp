# BranderUX — agent orientation

BranderUX is AI-UX infrastructure: it turns an AI agent into a full, branded, interactive
application. The customer's agent answers; BranderUX renders every answer as a live,
branded screen — clickable products, order panels, dashboards — not text.

## See it before you build it

`generate_screen` (the playground) renders a real branded, interactive screen in the
panel from demo data — no project required. Use it first when the user asks what
BranderUX looks like.

## The two integration paths

1. **SDK embed** (`@brander/sdk`) — the customer's site renders `<Brander />`, which opens
   a BranderUX iframe. Their agent receives `params` (system prompt + messages + tools)
   and streams answers back. Screens are generated at runtime from those answers.
   → `read_doc sdk-integration`, `get_integration_snippet`.
2. **Full agentic app** — the entire site is one full-screen Brander surface (see
   nova.branderux.app: no pages, everything generated). Built by creating a project,
   brand, custom elements and screens through THESE MCP TOOLS.
   → `read_doc rest-api`, `read_doc custom-elements-contract`, `read_doc screens-wire-format`.

## How to build a full agentic app with these tools

Build WITH the user, not silently — gather intent first, show results as you go:

0. ASK before building: what does the product do, what brand direction (or scrape their
   site's colors), and which 3-5 screens matter most (home, listing, detail, …)? If
   they want to see what BranderUX output looks like first, show the playground
   (`generate_screen`) before creating anything.
1. `whoami` — confirm identity and existing projects.
2. `create_project` — name + brand settings (colors/fonts, or set later with
   `update_brand_settings`).
3. `update_project_settings` — `{"uiGenerationMode": "flexible"}` (A2UI mode: the agent
   emits declarative screens; this is the mode for full apps). In the SAME call, set
   `customPages`: the embed's nav entries, one per top-level destination —
   `[{"id": "home", "name": "Home", "query": "Show me the home page"}, ...]` (3-5,
   matching the screens you'll build; each click runs its query).
4. Write custom elements YOURSELF (you know the product) following
   `custom-elements-contract`, publish with `create_element` — each one renders live in
   the panel as it publishes (supporting clients), so the user approves as you go.
5. Disable the FIXED elements that don't fit the product via `update_project_settings`
   `{"elementVisibility": {"data-table": false, ...}}` — a branded app should compose
   from ITS OWN elements, not generic tables/charts. Rule of thumb: keep `header` and
   `chat-bubble`; keep others only when the product genuinely needs them (charts for
   analytics, form for lead capture, …). The map merges key-wise; `custom:<key>`
   entries are never touched by fixed-element writes.
6. Compose example screens with `put_screen` following `screens-wire-format` — these teach
   the runtime AI your screen patterns. After each, SHOW it with `generate_screen (with projectId)`
   (real brand + the project's custom elements) so the user sees the assembled screen.
7. `create_api_key` — ASK the user for their site's exact origins first (required, no
   wildcards); the raw `bux_pk_` key is shown ONCE.
8. Point the customer's agent endpoint at their LLM with the verified snippet
   (`get_integration_snippet`) — `params.system` forwarding is mandatory.
9. FINISH with a copy-paste env block and where each value goes:
   `BRANDER_PROJECT_ID=<project id>` and `BRANDER_API_KEY=<bux_pk_ key>` (framework
   naming per the snippet, e.g. NEXT_PUBLIC_* only for values that are safe in the
   browser — the pk key is publishable, provider LLM keys are NOT).

## Critical traps (each has silently broken real integrations)

- `params.system` carries ALL screen-generation instructions. Dropping it disables UI
  generation entirely — the default (flexible) mode emits plain text forever.
- `params.tools` is OPTIONAL (absent in flexible mode): always `params.tools?.provider`.
- `sseStream` POSTs `{ params }` — NESTED. Backends must read `req.body.params`.
- The REST API returns **204, not 404**, for absent resources.
- Screens are a FIELD of the project (`customScreens`), not a REST resource; positions in
  screen layouts are **0-based**; custom placements pin a published element version.
