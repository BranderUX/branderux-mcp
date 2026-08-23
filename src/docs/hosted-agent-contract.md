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

## Agent config (`upsert_agent_config`)

- `persona` — the business voice + facts, ≤20k chars. Write it about the
  BUSINESS (what it sells, shipping, hours, tone). Do NOT write platform
  behavior rules — the runtime wraps the persona in immutable platform rules
  (tool-truth, scope, injection posture) automatically.
- `enabled` — the single hosted-mode switch. `false` = serving refuses.
- `policies` — opaque JSON bag read by the runtime. Current keys:
  `loginRequirement` ("none" | "optional" | "required" — ASK THE OWNER during
  the build: "Do your customers need accounts?"), `handoff` (human-escalation
  contacts, both keys optional: `{"whatsapp": "+972501234567", "email":
  "help@business.com"}` — the runtime renders them as wa.me/mailto links when
  a user asks for a person; capture from the scrape or ask the owner).
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
- Upserting an existing name replaces the schema (version bumps). Schema is
  advisory-for-generation: the server validates structure/size, YOU are
  responsible for generating conforming rows.

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
rows. Writes are NOT available to the runtime yet (a later milestone adds
them behind end-user confirmation).

## Build-order rule of thumb

brand ∥ entities → seed ∥ persona/config → screens that present the
entities → verify with a test query. Screens referencing entity data should
name real fields from the schema in their element structure.

## Live external data sources (V25)

An entity may be backed by the business site's OWN public commerce API instead
of seeded rows. Flow: the builder's `discover_site_data` tool probes the site
(Shopify `/products.json`, WooCommerce Store API, Squarespace `?format=json`) → on status `found`, call
`define_entity` with the returned `source` `{kind, endpoint}` and a
`jsonSchema` that mirrors the sample rows' field names (`name`, `price`,
`regularPrice`, `onSale`, `currency`, `imageUrl`, `url`, `category`,
`inStock`, `description`). RULES:

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
