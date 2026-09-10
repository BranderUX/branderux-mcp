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

### HOW TO TALK TO THE OWNER (applies to every message in this arc)

Assume the owner is NOT technical: no jargon, no tool, field, config or version names, no
technical explanations — describe everything as business outcomes ("your order form now
saves requests", not "the entity's writePolicy is open"; "your shop is updated", not "the
version counter advanced"). Never paste raw JSON or tool output into chat unless the owner
asks for it — describe results in plain language. Focus on delivering results, not
explaining mechanics.

ONE OVERRIDE: consent and safety moments beat this rule — informed-consent questions for
write tools (question 5 below) keep their EXACT tool names and VERBATIM warnings; safety
text is never softened, summarized, or de-jargoned.

1. Ask the FIVE QUESTIONS below (in chat; WAIT for answers before writing config).
2. Brand ∥ `define_entity` (with the right `writePolicy`!) → `seed_records` (or live sources).
3. `upsert_agent_config` — persona + policies encoding the answers, ALWAYS including
   `policies.language` (the site's language) and `policies.timezone` (IANA zone) — both in
   EVERY hosted build, see Agent config; `upsert_skill` for real domain knowledge. Do NOT
   ask about the model: the default is silent — set `model` only if the owner raises it.
   ASK the owner here for `policies.legalName` (the registered business name) and
   `policies.noticeContact` (one email or phone for privacy requests) and store their
   answers: the site's privacy notice shows both, so neither is ever scraped or guessed.
4. Elements (submit elements MUST carry the full write payload — see MAKING A WRITE WORK)
   → screens → `customPages`.
5. `set_home_screen` — the designed home is a REQUIRED step for hosted apps, not a nicety:
   without it every landing costs a model call and loads slow.
6. **`publish_site` IMMEDIATELY as the last build step — do NOT wait to be asked.** Derive
   the slug from the business name; it is renameable later (rename moves the key origin
   too), so naming is never a reason to hold. Announce the live URL. Writes, sign-in, and
   owner emails only work on the published site — an unpublished build cannot be truly
   tested. Publishing yields BOTH the interactive site and a SEPARATE identity-free MCP
   endpoint at `https://<slug>.branderux.app/mcp` for visiting agents (reads plus the
   owner's enabled add-only writes — see "Where writes execute"; NOT public under
   `loginRequirement` "required"/"approval"/"private"). (If `publish_site` is not among
   your tools, say publishing is coming soon.)
   **WRAP-UP — the moment `publish_site` succeeds, tell the owner in plain words (no tool,
   field or platform-internal names):** (a) the live address of their site; (b) that AI
   assistants — Claude, ChatGPT and any MCP client — can now LOOK UP their business at the
   SAME address with `/mcp` on the end and answer about it in their brand, and give them
   that link too (there is nothing extra to set up or turn on: the address is simply the
   site URL + "/mcp") — LOGIN GATE FIRST: under `loginRequirement` "required", "approval"
   or "private" that endpoint refuses every assistant with a sign-in error, so say plainly
   that the `/mcp` address is not public while sign-in is required, make neither the
   look-up nor the write claim, and point (d) at the site itself; (c) under "none" /
   "optional", what the address can do: look-up always; and, when this build enabled
   writes (an `open` entity whose `create_` tool is not set `off`, or a stored handoff
   email), placing requests, orders and bookings too — the assistant asks the person for
   approval, then the record lands in the owner's Data pane as an anonymous row or the
   request reaches their inbox; with no writes enabled, say it is look-up only and orders,
   bookings and requests happen on the site itself; (d) two or three concrete things to try
   first ("ask it what's in stock today", "ask it about delivery times", "ask it when
   you're open" — and, only when writes are enabled, "ask it to book a table for two").
   This wrap-up is part of the step — a build that ends without it leaves the owner
   unaware half of what they now own.
7. **Their existing website, if they have one — put the agent on it too.** Right after
   the wrap-up, look at what that site is built on. A React/Next codebase (you can see
   it) → the SDK's hosted one-liner (`read_doc sdk-integration`:
   `<BranderChatWidget apiKey projectId />`, handler-free — never a backend route), on a
   key allow-listed for that origin the same way as below. Anything else (Wix, WordPress,
   Shopify, Squarespace, static HTML) → `get_integration_snippet` target `widget`: mint
   the key (`create_api_key`) and set its allow-list with `set_key_origins` to that
   site's EXACT origin (`https://their-site.com`, no wildcards; the list replaces, it
   does not merge — keep every origin that must stay), fill `data-color` from the brand's
   primary color and `data-icon` with `https://<slug>.branderux.app/brand-icon`, keep
   `data-preload="eager"` (the designed home replays with no model call, so the background
   load costs nothing and the chat opens instantly), and tell
   the owner where to paste the one line (Wix: Settings → Custom Code, Premium plan with
   a connected domain; WordPress: the theme's custom code, a headers-and-footers plugin
   or a Custom HTML block; Shopify: theme.liquid before `</body>`; anything else: before
   `</body>`). The widget serves visitors anonymously — no site sign-in inside it. With
   no existing site, say nothing about any of this.

## The five questions you MUST ask the owner (before enabling)

1. **Login**: "Do your customers need accounts on your site?" → store EXACTLY "none" |
   "optional" | "required" | "approval" in `policies.loginRequirement` (canonical values
   only — never the display phrasing).
2. **Access follow-up** (MANDATORY when the answer was required/approval): "Who should be
   able to sign in?" → `allowedEmailDomains` / `invitedEmails`.
3. **Handoff email** (MANDATORY before storing `policies.handoff.email`): "Which address
   should customer requests reach?" → store the address the owner TYPED. Never default to
   the signed-in account's email (`whoami`) or to an address you inferred from the scrape
   without confirmation — a stored email arms a REAL outbound channel. If the owner
   declines or does not answer, store NO `handoff` and say plainly that the site will have
   no email channel until one is set.
4. **Escalation timing** (MANDATORY whenever a handoff email is stored): "When should I
   email you about a customer?" (e.g. every booking or order / only when I can't help /
   bookings, complaints and questions) → encode the answer EXPLICITLY in the persona or a
   skill. With no stated policy the agent only escalates when a visitor asks for a human,
   and owners miss their own bookings.
5. **Write-tool informed consent** (MANDATORY before mounting ANY write tool — entity,
   connected-app, or custom-REST): explain in plain business language what each tool lets
   ANY visitor do, by verb class — create/add tools only ADD entries (low risk, the
   recommended set; `create_<entity>` is derived for every writable entity);
   update/delete tools MUST carry this warning VERBATIM, inside the question itself: "any
   visitor could change or delete EXISTING entries in your [app] — including ones created
   by other customers or by you; there is no 'only their own' limit"; send/post tools act
   AS the business. `update_<entity>` is OFF by default and mounts ONLY when you store
   `policies.writePolicies["update_<entity>"]` as "confirm" or "auto" — store it only
   after the owner approved editing with the warning above (no delete tool is ever
   derived for entities). Add-only needs nothing beyond the entity. Never mount a write
   tool the owner hasn't explicitly approved.

**Also ask — marketing consent** (CONDITIONAL, which is why it is not one of the five:
only when an entity collects a phone number or an email address — bookings, orders,
enquiries, waitlists, newsletter signups): "Do you plan to send offers or news to the
people who leave their details?" A yes means the entity carries a `marketingConsent`
field and the agent asks the visitor for it; a no means the list is service-only. The
convention is under "Collecting contact details" in Entities below — say the outcome
plainly either way, because the owner is the one who may not market to that list.

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
  owner asks about cost control), `language` (the site's language as a BCP-47
  tag such as "he" — preferred; a name such as "Hebrew" is also understood.
  Besides the reply lock, the published site and embed render their own chrome
  in it and flip to right-to-left for RTL languages; the runtime locks EVERY
  reply, screen label, form field and button to it. SET IT IN EVERY HOSTED
  BUILD from the business's own site: the platform's click queries and rules
  are English, so a non-English site without it code-switches mid-reply),
  `transcriptRetentionDays` (a JSON NUMBER of days, 30–730, default 180, out of
  range clamped and a fraction truncated: end-user conversations, visitor
  events and session analytics are hard-deleted by a nightly sweep once older
  than this — the period the site's privacy notice states must be whatever
  resolves here; set it only when the owner asks. A QUOTED string (`"365"`) is
  ignored by the server and the 180-day default silently applies, so the tool
  refuses one: send `{"transcriptRetentionDays": 365}`, or `null` to remove
  it),
  `timezone` (IANA zone such as "Asia/Jerusalem"; the runtime tells the agent
  the current LOCAL date and time so same-day cutoffs and "still available
  today" are judged correctly — anything invalid resolves to UTC. SET IT IN
  EVERY HOSTED BUILD from the business's location), `entityLabels`
  (`{"courses": "קורסים"}` — what visitors call each entity, plural, in the
  site language; the live site's activity rows ("Searched courses") show that
  label, so SET IT FOR EVERY ENTITY OF A NON-ENGLISH SITE — without it those
  rows stay English), `legalName` (the business's REGISTERED legal name, such
  as `"Blossom Flowers Ltd"` or `"פרחי לבלב בע״מ"`, not the shop sign: the
  published site's privacy notice names it as the business responsible for
  visitors' details), `noticeContact` (ONE email address or phone number for
  privacy requests, shown in that same notice, such as
  `"privacy@blossom.co.il"`). **ASK THE OWNER for both, with `ask_user`, in
  every hosted build ("What is the registered name of the business?", "Which
  email or phone should privacy requests reach?"), and store exactly what they
  answer. Never scrape, infer or guess either one: the notice is a legal page,
  and a name lifted off a website footer can name the wrong company, while a
  scraped address can hand privacy requests to someone who never agreed to
  field them. A question they did not answer stores nothing, never a
  placeholder: tell the owner their notice is missing that detail and ask
  again at the wrap-up.** `handoff`
  (human-escalation contacts, both keys optional: `{"whatsapp":
  "+972501234567", "email": "help@business.com"}` — the email comes from
  question 3 ONLY: the address the owner typed, never the signed-in account's
  email, never a guess; no answer = no `handoff`). **A stored `handoff.email`
  ACTIVATES the hosted agent's `escalate_to_owner` tool on the LIVE site:
  calling it REALLY EMAILS the owner (rate-limited) — this is a genuine
  outbound channel, and with a stated escalation policy (question 4 above)
  the agent emails the owner when the matching event completes (a booking,
  an order), not only when a visitor asks for a human. Tell owners this
  accurately: booking/contact requests on the published site DO reach their
  inbox. Never claim the hosted agent "has no email channel" — it does,
  whenever a handoff email is stored. It never mounts on owner test/preview
  surfaces (published site only). The wa.me link gets a `?text=` prefill with
  the visitor's request context.**
- `dailyTokenBudget` — cost-weighted tokens/day (default 2,000,000). Serving
  429s past it; resets daily (UTC).
- `level` — ANSWER QUALITY, a stop from 1 to 5; the owner never hears a model,
  a vendor or a price. 1 = "Fastest & cheapest — quick answers to simple
  questions", 2 = "Fast — good for FAQs and lookups", 3 = "Balanced — right
  for most shops (default)", 4 = "Smart — a stronger model for harder
  questions", 5 = "Smartest & most expensive — our strongest model". OMIT IT in a normal
  build: the Balanced default is right for almost every business. Set it ONLY
  when the owner explicitly asks for faster, cheaper or smarter answers, using
  exactly those words; if they name a model or a vendor, translate it into a
  stop in plain words without confirming what backs it. Which model and how
  much thinking back each stop is BranderUX's decision (Admin → Model Levels),
  never the owner's, and it may change without notice. Cost talk: never a
  price, a dollar amount, a per-token rate or a ratio — the ONE fact you may
  state is that higher stops cost more per conversation turn, lower stops
  less. Stored per project and live on the site's next answer (the AI SDK seam
  is the only serve runner); the Agent tab's agent card carries the same
  five-stop slider. `get_agent_config` echoes the STORED stop — after storing,
  say in one sentence which stop now answers their customers and point at the
  slider,
  and never "verify" a change by reading the config back.

**Your own API key (BYOK).** An owner may answer their visitors on their own
provider key (Anthropic or OpenAI — Google keys are not supported yet: say so
plainly and store none) instead of BranderUX's. The key is
entered ONLY through the "Your API key" card (under Advanced in the Agent tab's
Answer quality panel) — or, when you are the
in-app Builder, its `request_credential` tool with the name `model-<provider>`
(`model-anthropic` | `model-openai`): a secure field that posts
straight to the vault, so only a non-secret confirmation enters the
conversation. It is stored encrypted server-side, never shown again, and used
only to answer that project's visitors. You NEVER handle it: never ask for a
key, never read, echo, or place one in the conversation, and never pass one
through any other tool (`set_connector_credential` is for data-source
credentials, not model keys). If the owner pastes a key in chat, tell them to
remove it and enter it in the card instead. Turns answered on the owner's own
key are billed by that provider to the owner.

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
    **Never for intake.** Rows a visitor submits about themselves (enquiries,
    bookings, orders, requests — names, phones, emails, free text) are readable
    by EVERY visitor and every MCP client on public-read, ids included. Make
    intake entities `end-user-scoped`. On an EXISTING project run
    `list_entities` FIRST and re-define any intake entity that is public-read
    as `end-user-scoped` (same `jsonSchema`) before anything else — an entity
    defined before this rule is still open.
  - `end-user-scoped` — rows belong to ONE signed visitor (carts, orders).
    Identity is LIVE: serve verifies the site's signed session cookie and
    scopes reads to that visitor. With NO identity — an anonymous visitor,
    the owner test chat, the site-MCP endpoint — the `query_<name>` READ tool
    is NOT mounted at all (a mounted-but-empty tool read as "this business
    has no orders"; now the agent simply has no data path). So pick it ONLY
    under `loginRequirement` "required"/"approval". Under "none"/"optional"
    use `public-read` for anything a visitor must read back (public-read rows
    are readable by EVERY visitor — keep personal data off them). Writes:
    open writes stamp the signed visitor's identity when one is present, so
    that visitor reads their own rows back; ANONYMOUS open rows have no owner
    and are visible to the owner only (`list_entity_records` / Data pane).
  - `owner-only` — internal; NEVER served, invisible to the runtime.
- `writePolicy`:
  - `none` (default) — read-only entity, no write tools.
  - `end-user-owned` — signed visitors create/update THEIR OWN rows
    (bookings, orders). Requires `loginRequirement` "required" or "approval":
    under "none"/"optional" login, anonymous visitors cannot write to it and
    every submission silently fails — use `open` there.
  - `open` — any visitor may write, confirm-first. NEVER pair it with
    `accessPolicy: end-user-scoped` under `loginRequirement` "none"/"optional"
    expecting visitors to read back what they wrote: anonymous rows are
    owner-visible only, and anonymous visitors carry no `query_<name>` tool.
  Writes always run through the visitor-confirmation plane unless the owner
  sets a tool to auto.
  **Where writes execute**: visitor write tools (entity, connected-app, and
  custom-REST writes) run ONLY on the published site, where the visitor's
  Confirm card can complete them. The owner test chat is read-only by design
  (write tools are not mounted there); previews and the playground cannot
  write either. Publishing also mints a SEPARATE identity-free MCP endpoint at
  `https://<slug>.branderux.app/mcp` for VISITING agents (ChatGPT, Claude,
  another business's agent): `get_business_info` + `query_*` +
  `generate_screen` + connected-app READS (`hub_*`), PLUS the hosted agent's
  add-only entity writes for `open` entities — `create_<entity>` unless
  `policies.writePolicies` sets it `off` (`update_<entity>` only on its
  explicit opt-in; `confirm` and `auto` both mount there because the MCP
  client's own approval prompt IS the confirmation: no Confirm card, the write
  executes directly and lands as an ANONYMOUS row in the Data pane) — and
  `escalate_to_owner` when a handoff email is stored. Never `rest_*` or
  connected-app writes; `end-user-owned` entities never mount there (that
  transport has no sign-in), and under `loginRequirement` "required" /
  "approval" / "private" the endpoint refuses every assistant (not public).
  Its `tools/list` still says NOTHING about the hosted agent's own tool belt:
  connecting an MCP client to that URL tells you nothing about whether
  `create_<entity>` is mounted on the site's own agent. Verify a SITE write by
  submitting the form on the site itself and checking `list_entity_records` /
  the Agent tab's Data pane. Set that expectation before the owner tests a
  write flow.
- **Collecting contact details (phone, email)** — two rules every intake entity
  (bookings, orders, enquiries, waitlists, newsletter signups) follows:
  - **Say where it goes BEFORE collecting.** The live agent tells the visitor, in the
    site's language, where their details land BEFORE it asks for a name, phone, email
    or address: stored in the business's own records (its bookings, its orders — and
    processed by BranderUX on the business's behalf), emailed to the business,
    sent to the business's own system, or written into a connected app. Every write
    tool carries that instruction in its own description, so it happens by default —
    never write a persona, skill, element instruction or house rule that suppresses,
    shortens or postpones it, and never tell an owner the agent collects details
    silently.
  - **Marketing consent, or service-only.** Contact details may always be used to
    answer or fulfil that person's OWN request; MARKETING to them (offers,
    newsletters, SMS campaigns) needs their recorded consent. So either add a boolean
    **`marketingConsent`** field to the entity — its `description` carrying the EXACT
    wording the visitor is shown at collection ("Agreed to receive offers and updates
    from <business> by email or SMS"), plus a persona/skill line telling the agent to
    ask that wording in plain words and store `true` ONLY on a clear yes (never
    defaulted, never inferred from silence, never a condition of the order) — or store
    no consent field and tell the owner plainly that the list is service-only.
    `list_entity_records` returns a top-level `notice` for any entity whose schema
    holds contact fields, restating that the list may not be marketed to without the
    consent on each row.
- Upserting an existing name replaces the schema (version bumps).
  Re-defining an entity keeps its `accessPolicy` unless you pass a new one —
  the tool carries the stored value forward, so a schema-only update never
  reopens an intake entity. Schema is advisory-for-generation: the server
  validates structure/size, YOU are responsible for generating conforming
  rows.

## MAKING A WRITE ACTUALLY WORK (4 required pieces — a writable entity alone does NOTHING)

A `writePolicy` of `end-user-owned`/`open` derives ONE runtime tool named literally
**`create_<entity>`** (e.g. `create_orders`) per writable entity. **`update_<entity>` is
OFF by default**: it mounts ONLY when `policies.writePolicies["update_<entity>"]` is
explicitly "confirm" or "auto" (an `open` update is UNSCOPED server-side — any visitor
could patch any row of that entity — which is why it needs the verbatim consent warning
from question 5). Add-only needs nothing beyond the entity; no delete tool is ever
derived. But a working write needs ALL FOUR pieces, and skipping any one ships a
confirmation screen that confirms nothing:

1. **The entity**: `define_entity` with the right `writePolicy` (respect the coherence
   rule above), and a schema whose fields cover everything fulfilment needs (an orders
   schema without delivery address/recipient phone produces rows no one can act on) —
   plus, when it collects a phone or an email, the `marketingConsent` field or an
   explicit service-only decision (see "Collecting contact details").
2. **A submit element that carries the FULL payload**: the submit callback's
   `clickQueryTemplate` must name EVERY field the write tool needs
   (`"Submit order: {name}, {phone}, deliver to {deliveryAddress}, message: {cardMessage}, total {total}"`)
   — form submissions reach the runtime agent as a QUERY built from that template, and
   tokens you don't name are DISCARDED before the agent ever sees them.
3. **Instructions to write**: the persona or a skill must explicitly say to call
   `create_<entity>` when a submission arrives (and `escalate_to_owner` in the same turn,
   per the owner's escalation policy). `flexibleModeRules` does NOT reach the answering
   agent — it steers screen generation only; write instructions there are dead text. What
   those instructions must NEVER do is suppress the write tool's own collection notice
   (where the details go, said before they are asked for) or the consent question when the
   entity carries `marketingConsent`.
4. **Verify**: `list_entities` returns `writePolicy` — check it round-tripped.

Per-tool modes ride `policies.writePolicies`, keyed by the LITERAL tool name:
`{"create_orders": "auto" | "confirm" | "off", "update_orders": "confirm" | "auto"}` —
`create_*` defaults to confirm; `update_*` stays unmounted unless you store its key (only
after the owner approved editing with the verbatim warning; if you told the owner the write
is add-only, store nothing for `update_*`). Where confirm-mode writes complete: the published `{slug}.branderux.app`
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
- Demo imagery must be SUBJECT-APPROPRIATE or ABSENT. Never point image
  fields at random-photo services (picsum.photos and the like): they put
  unrelated subjects on a live catalog that looks real. When the owner has no
  photos, prefer an EMPTY `imageUrl` (elements must render without it) and
  ask the owner for photos — the Agent tab's bulk upload → `update_record` on
  `imageUrl` patches them in later.
- Time-bearing rows (delivery slots, availability, opening exceptions,
  events) GO STALE: seeded on build day, they are wrong every day after.
  Prefer a live source. If you must seed, generate the rows RELATIVE TO TODAY
  at build time (ISO dates computed from the current date, a rolling window)
  and tell the owner these rows expire and must be refreshed or replaced by a
  live source. Never hardcode "today"/"tomorrow"-style labels or a fixed day
  name into a row — the runtime tells the agent the current local time, so
  such labels are derived from the ISO date at answer time.

## What the runtime does with all this (context, not your job)

Serving (`/api/agent/serve`, project-key auth) assembles: persona +
platform rules + the language lock (`policies.language`) + the current LOCAL
date and time (`policies.timezone`) + the project's screens + the tool belt
below. The agent queries (filters: eq/neq/lt/lte/gt/gte/contains, sort,
limit ≤50; results capped at 48KB), then renders screens from real rows.
Entity writes are governed by `writePolicy` (default `none` = read-only);
when enabled, write tools run through the visitor-confirmation plane — each
write is confirmed by the visitor unless the owner sets that tool to auto.

### Runtime tool inventory

| Tool | Mounts when | Surface | Trace label on the site |
| --- | --- | --- | --- |
| `query_<entity>` | every servable entity: `public-read` always; `end-user-scoped` ONLY with a verified visitor identity; `owner-only` never | published site, SDK embed, owner test chat, site-MCP | "Queried <entity>" (e.g. "Queried bouquets") |
| `create_<entity>` | `writePolicy` end-user-owned/open and `writePolicies["create_<entity>"]` not "off"; confirm mode needs the Confirm card (the `{slug}.branderux.app` site), auto also completes on SDK embeds | published/key surfaces only — never the owner test chat, previews, playground, or site-MCP | "Created <entity>" |
| `update_<entity>` | as `create_` PLUS an explicit `writePolicies["update_<entity>"]` of "confirm"/"auto" | same as `create_` | "Updated <entity>" |
| `escalate_to_owner` | `policies.handoff.email` stored | published/key surfaces only | "Escalated to owner" |
| `remember_preference` | a SIGNED-IN visitor (verified site session cookie) | published site only — never owner surfaces, never anonymous visitors | "Remembered preference" |
| `hub_<toolkit>_<action>` | active connector-hub connections; reads always, writes only those the owner approved (gated like entity writes) | reads on every surface incl. site-MCP; writes published/key only | the action humanized, e.g. `hub_googlecalendar_create_event` → "Created event" |
| `rest_<name>` | `policies.customWrites` definitions | published/key surfaces only | "Sent <name>" (e.g. `rest_book_table` → "Sent book table") |

The site UI shows each tool call as a humanized step — present tense while
it runs ("Querying bouquets"), past tense once done — so every trace line
maps back to exactly one tool above. A "Remembered preference" trace
therefore PROVES a signed-in published-site session; it can never come from
the owner test chat.

## Build order (hosted)

The arc at the top of this doc is the build order: questions → brand ∥ entities
(writePolicy!) → seed ∥ persona/config/skills → elements (submit payloads!) → screens →
pages → `set_home_screen` → **`publish_site`, immediately, unprompted**. Screens
referencing entity data should name real fields from the schema in their element
structure. The arc ends at a LIVE URL, not at "verified with a test query" — then, ONLY
when the owner already has a website, one closing step puts the agent on it (step 7):
`get_integration_snippet` target `widget` for Wix, WordPress, Shopify, Squarespace or
static HTML (its key allow-listed for that site's origin via `set_key_origins`), the
SDK's hosted one-liner for a React/Next codebase.

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
