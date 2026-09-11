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

**FORK FIRST — which lane?** If the business has NO AI of its own (a shop, a service, a
restaurant that just wants an app), you are building a **BranderUX-HOSTED agent**: the
platform's agent answers from managed entities, the site publishes to
`<slug>.branderux.app` (publishing yields BOTH the interactive site and an identity-free
MCP endpoint at `<slug>.branderux.app/mcp` for visiting agents — reads plus the owner's
enabled add-only writes), and the arc is DIFFERENT
from the steps below — mandatory owner questions, entities + write wiring,
`set_home_screen`, then `publish_site` immediately.
→ **`read_doc hosted-agent-contract` and follow THE HOSTED BUILD ARC there instead.**
That owner is a business person, not an engineer: describe everything as business outcomes
("your order form now saves requests") and never in platform internals — no tool, field,
config or version names, no raw JSON (consent and safety warnings are the one exception and
keep their exact wording).
The steps below (API key, endpoint, env vars) are ONLY for customers whose own agent
answers.

## How to build a full agentic app with these tools

Build WITH the user, not silently — gather intent first, show results as you go:

0. ASK before building: what does the product do, what brand direction (or scrape their
   site's colors), and which 3-5 screens matter most (home, listing, detail, …)? If
   they want to see what BranderUX output looks like first, show the playground
   (`generate_screen`) before creating anything.
   **Also ask: do you already have UI components for agent responses (your own gen-UI
   elements, product cards, panels)?** If yes → `read_doc port-existing-components`
   and port them FIRST (before screens, so screens can reference them): same look,
   branded, AI-placeable — and their server calls stay in the customer's app via the
   SDK's `actionHandlers` (see the `action-handlers` snippet).
1. `whoami` — confirm identity and existing projects.
2. `create_project` — name + brand settings (colors/fonts, or set later with
   `update_brand_settings`); when the business has a site, its logo URL goes in `iconUrl`
   (the apple-touch-icon or header logo, never invented) and `logoHasWordmark: true` when that
   logo spells the name, so the header shows the logo alone while `brandName` stays real.
3. `update_project_settings` — set `customPages`: the embed's nav entries, one per
   top-level destination —
   `[{"id": "home", "name": "Home", "query": "Show me the home page"}, ...]` (3-5,
   matching the screens you'll build; each click runs its query). Projects serve
   flexible (A2UI) mode by default — leave `uiGenerationMode` unset; write it only
   when the owner explicitly wants deterministic screens.
   `customPages` is REQUIRED, not optional: a project without them opens the
   playground to a "set up pages" dialog instead of the product. If you set
   settings early, come back after the screens exist and set the final pages —
   and VERIFY with `get_project` that `settings.customPages` is non-empty
   before you tell the user the build is done.
4. Write custom elements YOURSELF (you know the product) following
   `custom-elements-contract`, publish with `create_element` — each one renders live in
   the panel as it publishes (supporting clients), so the user approves as you go.
5. Disable the FIXED elements that don't fit the product via `update_project_settings`
   `{"elementVisibility": {"data-table": false, ...}}` — a branded app should compose
   from ITS OWN elements, not generic tables/charts. Rule of thumb: keep `header`;
   `chat-bubble` is ALWAYS on (a false for it is ignored — every text answer renders
   through it); keep others only when the product genuinely needs them (charts for
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
