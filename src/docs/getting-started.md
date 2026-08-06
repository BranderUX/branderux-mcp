# BranderUX — agent orientation

BranderUX is AI-UX infrastructure: it turns an AI agent into a full, branded, interactive
application. The customer's agent answers; BranderUX renders every answer as a live,
branded screen — clickable products, order panels, dashboards — not text.

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

1. `whoami` — confirm identity and existing projects.
2. `create_project` — name + brand settings (colors/fonts, or set later with
   `update_brand_settings`).
3. `update_project_settings` — `{"uiGenerationMode": "flexible"}` (A2UI mode: the agent
   emits declarative screens; this is the mode for full apps).
4. Write custom elements YOURSELF (you know the product) following
   `custom-elements-contract`, publish with `create_element`.
5. Compose example screens with `put_screen` following `screens-wire-format` — these teach
   the runtime AI your screen patterns.
6. `create_api_key` — mint the `bux_pk_` key the customer's site passes to `<Brander />`.
7. Point the customer's agent endpoint at their LLM with the verified snippet
   (`get_integration_snippet`) — `params.system` forwarding is mandatory.

## Critical traps (each has silently broken real integrations)

- `params.system` carries ALL screen-generation instructions. Dropping it disables UI
  generation entirely — the default (flexible) mode emits plain text forever.
- `params.tools` is OPTIONAL (absent in flexible mode): always `params.tools?.provider`.
- `sseStream` POSTs `{ params }` — NESTED. Backends must read `req.body.params`.
- The REST API returns **204, not 404**, for absent resources.
- Screens are a FIELD of the project (`customScreens`), not a REST resource; positions in
  screen layouts are **0-based**; custom placements pin a published element version.
