# Hosted Agent & Managed Entities — Wire Contract

How a project gets its own BranderUX-hosted agent (the "agentic app" mode for
customers WITHOUT their own AI) and the managed data it answers from. Feature
is flag-gated (`AGENTIC_APPS_ENABLED`) — tools work regardless; serving
activates when the flag is on.

## The model

```
agent_config (per project)  →  enables /api/agent/serve on the project's key
entities (per project)      →  auto-become query_<name> READ tools for the agent
records (per entity)        →  the rows those tools return (tool-truth)
```

The end-user experience: a shopper asks → the hosted agent queries the
project's entities → answers with REAL rows rendered into branded screens.
The agent never invents prices/stock; if data is missing it says so.

## THE HOSTED BUILD ARC (follow in order — every step, no step is optional)

1. Ask the FOUR QUESTIONS below (in chat; WAIT for answers before writing config).
2. Brand ∥ `define_entity` (with the right `writePolicy`!) → `seed_records` (or live sources).
3. `upsert_agent_config` — persona + policies encoding the answers; `upsert_skill` for real
   domain knowledge.
4. Elements (submit elements MUST carry the full write payload — see MAKING A WRITE WORK)
   → screens → `customPages`.
5. `set_home_screen` — the designed home is a REQUIRED step for hosted apps, not a nicety:
   without it every landing costs a model call and loads slow.
6. **`publish_site` IMMEDIATELY as the last build step — do NOT wait to be asked.** Derive
   the slug from the business name; it is renameable later (rename moves the key origin
   too), so naming is never a reason to hold. Announce the live URL. Writes, sign-in, and
   owner emails only work on the published site — an unpublished build cannot be truly
   tested. (If `publish_site` is not among your tools, say publishing is coming soon.)

## The four questions you MUST ask the owner (before enabling)

1. **Login**: "Do your customers need accounts on your site?" → store EXACTLY "none" |
   "optional" | "required" | "approval" in `policies.loginRequirement` (canonical values
   only — never the display phrasing).
2. **Access follow-up** (MANDATORY when the answer was required/approval): "Who should be
   able to sign in?" → `allowedEmailDomains` / `invitedEmails`.
3. **Escalation timing** (MANDATORY whenever a handoff email is stored): "When should I
   email you about a customer?" (e.g. every booking or order / only when I can't help /
   bookings, complaints and questions) → encode the answer EXPLICITLY in the persona or a
   skill. With no stated policy the agent only escalates when a visitor asks for a human,
   and owners miss their own bookings.
4. **Write-tool informed consent** (MANDATORY before mounting ANY connected-app write
   tool): explain in plain business language what each tool lets ANY visitor do, by verb
   class — create/add tools only ADD entries (low risk, the recommended set);
   update/delete tools MUST carry this warning VERBATIM, inside the question itself: "any
   visitor could change or delete EXISTING entries in your [app] — including ones created
   by other customers or by you; there is no 'only their own' limit"; send/post tools act
   AS the business. Never mount a write tool the owner hasn't explicitly approved.

## Agent config (`upsert_agent_config`)

- `persona` — the business voice + facts, ≤20k chars. Write it about the
  BUSINESS (what it sells, shipping, hours, tone). Do NOT write platform
  behavior rules — the runtime wraps the persona in immutable platform rules
  (tool-truth, scope, injection posture) automatically.
- `enabled` — the single hosted-mode switch. `false` = serving refuses.
- `policies` — opaque JSON bag read by the runtime. Current keys:
  `loginRequirement` ("none" | "optional" | "required" | "approval" — ASK THE
  OWNER during the build: "Do your customers need accounts?"; "approval" =
  anyone may request access after verifying their email, the owner
  approves/denies each visitor in the Agent tab's Audience pane and gets one
  notification email per request; invited/domain-matched addresses skip the
  queue), `allowedEmailDomains` (array of lowercase domains, <=20 — only
  those domains can sign in, in ANY login mode; invited addresses exempt),
  `invitedEmails` (array of lowercase emails, <=200 — always admitted),
  `visitorLimits` (`{"turnsPerDay": N, "anonymousTurnsPerDay": N}`, integers
  1-100000 — per-visitor daily turn caps; ALWAYS ON with platform defaults
  300 signed / 100 anonymous per day, so store overrides only when the
  owner asks about cost control), `handoff` (human-escalation contacts, both
  keys optional: `{"whatsapp": "+972501234567", "email": "help@business.com"}`
  — capture from the scrape or ask the owner). **A stored `handoff.email`
  ACTIVATES the hosted agent's `escalate_to_owner` tool on the LIVE site:
  calling it REALLY EMAILS the owner (rate-limited) — this is a genuine
  outbound channel, and with a stated escalation policy (question 3 above)
  the agent emails the owner when the matching event completes (a booking,
  an order), not only when a visitor asks for a human. Tell owners this
  accurately: booking/contact requests on the published site DO reach their
  inbox. Never claim the hosted agent "has no email channel" — it does,
  whenever a handoff email is stored. It never mounts on owner test/preview
  surfaces (published site only). The wa.me link gets a `?text=` prefill with
  the visitor's request context.**
- `dailyTokenBudget` — cost-weighted tokens/day (default 2,000,000). Serving
  429s past it; resets daily (UTC).
- `modelTier` — "standard" | "premium" (stored; inert until pricing ships).

## Entities (`define_entity`)

- `name`: `^[a-z][a-z0-9_]{0,63}$` (snake_case, becomes the `query_<name>`
  tool). Max 20 entities/project.
- `jsonSchema`: JSON Schema object with non-empty `properties`. Field names
  matching `[a-zA-Z][a-zA-Z0-9_]*` become filterable/sortable. Give every
  field a `description` — it rides into the agent's tool docs. Mark image
  fields with `"format": "image-url"`. Numbers you want range-filterable
  (price, stock) must be `"type": "number"` and stored as JSON numbers.
- `accessPolicy`:
  - `public-read` (default) — catalog-class data, served to any end user.
  - `end-user-scoped` — rows belong to one end user (carts, orders). Served
    only with a signed identity (a later milestone) — defining them early is
    fine, they just read empty until then.
  - `owner-only` — internal; NEVER served, invisible to the runtime.
- `writePolicy`:
  - `none` (default) — read-only entity, no write tools.
  - `end-user-owned` — signed visitors create/update THEIR OWN rows
    (bookings, orders). Requires `loginRequirement` "required" or "approval":
    under "none"/"optional" login, anonymous visitors cannot write to it and
    every submission silently fails — use `open` there.
  - `open` — any visitor may write, confirm-first.
  Writes always run through the visitor-confirmation plane unless the owner
  sets a tool to auto.
  **Where writes execute**: visitor write tools (entity, connected-app, and
  custom-REST writes) run ONLY on the published site, where the visitor's
  Confirm card can complete them. The owner test chat is read-only by design
  (write tools are not mounted there); previews and the playground cannot
  write either. Set that expectation before the owner tests a write flow.
- Upserting an existing name replaces the schema (version bumps). Schema is
  advisory-for-generation: the server validates structure/size, YOU are
  responsible for generating conforming rows.

## MAKING A WRITE ACTUALLY WORK (4 required pieces — a writable entity alone does NOTHING)

A `writePolicy` of `end-user-owned`/`open` derives runtime tools named literally
**`create_<entity>` / `update_<entity>`** (e.g. `create_orders`) — but a working write
needs ALL FOUR pieces, and skipping any one ships a confirmation screen that confirms
nothing:

1. **The entity**: `define_entity` with the right `writePolicy` (respect the coherence
   rule above), and a schema whose fields cover everything fulfilment needs (an orders
   schema without delivery address/recipient phone produces rows no one can act on).
2. **A submit element that carries the FULL payload**: the submit callback's
   `clickQueryTemplate` must name EVERY field the write tool needs
   (`"Submit order: {name}, {phone}, deliver to {deliveryAddress}, message: {cardMessage}, total {total}"`)
   — form submissions reach the runtime agent as a QUERY built from that template, and
   tokens you don't name are DISCARDED before the agent ever sees them.
3. **Instructions to write**: the persona or a skill must explicitly say to call
   `create_<entity>` when a submission arrives (and `escalate_to_owner` in the same turn,
   per the owner's escalation policy). `flexibleModeRules` does NOT reach the answering
   agent — it steers screen generation only; write instructions there are dead text.
4. **Verify**: `list_entities` returns `writePolicy` — check it round-tripped.

Per-tool modes ride `policies.writePolicies` (`{"create_orders": "auto" | "confirm" | "off"}`,
default confirm). Where confirm-mode writes complete: the published `{slug}.branderux.app`
site (an SDK embed on the customer's own domain completes only `auto`-mode writes — the
confirm card cannot land there). The owner sees incoming rows in the app's Agent tab →
**Data** pane (a live records browser), via `list_entity_records` here, and in their inbox
when escalation is configured — never tell an owner their orders are invisible.

## Records (`seed_records`)

- ≤500 rows per call, ≤32KB per row, ≤50k rows per entity.
- Rows are plain JSON objects matching the schema. Store numbers as numbers
  (never `"₪120"` strings — range filters and sorts need numerics; put the
  currency in the schema description, the UI formats it).
- Images: store URLs in the image fields (uploads/scrapes land in storage
  separately; data carries URLs only).
- Seeding demo data? Mark it clearly in a `_demo: true` field so it can be
  cleaned later, and tell the owner it's sample data.

## What the runtime does with all this (context, not your job)

Serving (`/api/agent/serve`, project-key auth) assembles: persona +
platform rules + the project's screens + one `query_<name>` READ tool per
servable entity. The agent queries (filters: eq/neq/lt/lte/gt/gte/contains,
sort, limit ≤50; results capped at 48KB), then renders screens from real
rows. Entity writes are governed by `writePolicy` (default `none` =
read-only); when enabled, write tools run through the visitor-confirmation
plane — each write is confirmed by the visitor unless the owner sets that
tool to auto.

## Build order (hosted)

The arc at the top of this doc is the build order: questions → brand ∥ entities
(writePolicy!) → seed ∥ persona/config/skills → elements (submit payloads!) → screens →
pages → `set_home_screen` → **`publish_site`, immediately, unprompted**. Screens
referencing entity data should name real fields from the schema in their element
structure. The arc ends at a LIVE URL, not at "verified with a test query".

## Live external data sources (V25)

An entity may be backed by the business site's OWN public commerce API instead
of seeded rows. Flow: the builder's `discover_site_data` tool probes the site
(Shopify `/products.json`, WooCommerce Store API, Squarespace `?format=json`) → on status `found`, call
`define_entity` with the returned `source` `{kind, endpoint}` and a
`jsonSchema` that mirrors the sample rows' field names (`name`, `price`,
`regularPrice`, `onSale`, `currency`, `imageUrl`, `url`, `category`,
`inStock`, `description`). On MCP (no `discover_site_data` tool there): probe
the platform's standard endpoint yourself with `probe_api` — Shopify
`<store>/products.json`, WooCommerce `<site>/wp-json/wc/store/products`,
Squarespace `<site>/?format=json` — then call `define_entity` with the
matching `source.kind` (`shopify-products` | `woo-store-products` |
`squarespace-products`) and that endpoint. RULES:

- NEVER `seed_records` for a live-sourced entity — its `query_<name>` tool
  fetches the endpoint at serve time (normalized + cached ~2min), so prices,
  stock and images track the store.
- Page text and screenshots are NEVER a data source for ANY entity — they
  serve styling and schema discovery only. An eyeballed catalog is partial
  and wrong-priced while looking real.
- `blocked` means bot protection refused server access: say so, and ask the
  user for a catalog export (CSV/Excel/PDF/photos) instead.
- Re-running `define_entity` WITHOUT `source` converts the entity back to
  managed rows.

## Skills (SKILL.md, V26)

`upsert_skill` stores focused markdown packs (kebab-case name, ≤16k chars,
max 10/project) that ride INSIDE the hosted agent's prompt on every serve
call — domain knowledge and behavior: shipping/returns policy, sizing guides,
care instructions, service processes. Keep each one SHORT and specific
(everything enabled costs every call; total injection is capped at 24k).
Skills carry the same authority as the persona — they can never override
platform rules. `enabled=false` parks a skill without deleting.

## Universal custom-REST connector (V28)

ANY JSON API the business has (booking engine, POS, inventory) can be a live
source — not just the discovery platforms. Flow:

1. `set_connector_credential` — vault the API key (bearer/header/basic/query).
   Encrypted server-side; never echoed back. Skip for public APIs.
2. `probe_api` — fetch the endpoint (with the credential) and LOOK at the
   returned sample.
3. Author the `fieldMap` from what you saw: `rows` = dot-path to the array
   ("" when the root IS the array); `fields` = {name: "title", city:
   "location.city", price: {path: "rate.total", type: "number"}, imageUrl:
   "images.0.url", bookingUrl: "links.book"}. Map `_id` when the API has ids.
4. `define_entity` with `source: {kind: "custom-rest", endpoint,
   credentialName?, fieldMap}` — queries fetch the API live (credentialed
   fetches run through the server vault). NEVER seed a live-sourced entity.

Booking/reservation flows still END on the business's engine via deep links
(bookingUrl field) — rates and payment stay theirs.

## Home screen — canned first paint (`set_home_screen`)

Stores the DESIGNED first page: layout decided once, rows REAL on every
landing. When a visitor lands, the first custom page's query auto-fires and
serve replays this screen with zero model calls — but each binding's query
runs LIVE (store API or managed records), so prices/stock/items stay current.
Works in flexible (the default) and deterministic modes.

- `matchQuery` — MUST equal the first custom page's query verbatim.
- `screenId` — an existing custom screen.
- `data` — STATIC layout/copy props only (`{elementId: props}` — headers,
  greetings, category labels); NEVER bake product rows into it.
- `bindings` (≤3) — where the live rows go: `{path: "elementId.propName",
  entityName, filters? (≤4; numbers as JSON numbers — range ops need
  numerics), sort?, limit? (≤50)}`.
- `followUpText` — optional short greeting rendered ABOVE the home screen;
  write copy that introduces what is below it.
- Refresh after changing the home screen's layout. Clear with
  `upsert_agent_config {"homeScreen": {}}`.
