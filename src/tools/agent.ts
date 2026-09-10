import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import { CONFIRM_HINT, DESTRUCTIVE, IDEMPOTENT_WRITE, READ_ONLY, WRITE, fail, guarded, ok } from "./helpers.js";
import { contactFields, contactRecordsNotice } from "../lib/contact-fields.js";
import { isPlainObject, mergePolicyBag } from "../lib/policy-bag.js";

const projectIdSchema = z.string().uuid();
const entityNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/, "snake_case, starting with a letter");
const skillNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,63}$/, "kebab-case, starting with a letter");
const recordIdSchema = z.string().uuid();
const httpsUrlSchema = z
  .string()
  .url()
  .refine((v) => new URL(v).protocol === "https:", "must be https://");

/**
 * Hosted-agent + managed-entities tools (agentic apps). These configure a
 * project's OWN BranderUX-hosted agent — the mode for customers without
 * their own AI. Read brander://docs/hosted-agent-contract BEFORE using them;
 * the wire rules there (schema grammar, numbers-as-numbers, access policies)
 * fail silently when guessed.
 */
export function registerAgentTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "upsert_agent_config",
    {
      title: "Configure hosted agent",
      description:
        "Create/update the project's hosted-agent configuration (persona, enabled switch, policies, daily token budget). " +
        "Partial: omitted fields keep their current value, and policies MERGES key by key with the stored bag (send only the keys that change; a key set to null is removed). persona = the BUSINESS voice + facts only — platform rules are added by the runtime. " +
        "Read brander://docs/hosted-agent-contract first — its FIVE MANDATORY OWNER QUESTIONS (login, access follow-up, " +
        "handoff email, escalation timing, write consent) must be asked and answered BEFORE enabling. handoff.email is the address " +
        "the owner TYPED — never the signed-in account's email, never a guess; no answer = store no handoff. A stored handoff.email ACTIVATES " +
        "escalate_to_owner on the live site — it REALLY emails the owner; encode the owner's escalation-timing answer in the persona or a skill. " +
        "Set policies.language (the site's language — the runtime locks every reply and screen label to it) and policies.timezone " +
        "(IANA zone — the runtime tells the agent the current local time) in EVERY hosted build. " +
        "COLLECTION NOTICE: on the live site the agent tells a visitor WHERE their details go before it asks for them (every write tool carries that instruction) — " +
        "never write a persona, skill or policy that suppresses it, and an entity collecting a phone or an email needs the marketingConsent convention from the contract " +
        "or its list stays service-only. update_<entity> tools are OFF by default: " +
        "one mounts only when policies.writePolicies[\"update_<entity>\"] is \"confirm\" or \"auto\" (owner-approved editing, verbatim warning asked).",
      inputSchema: {
        projectId: projectIdSchema.describe("Project id"),
        enabled: z.boolean().optional().describe("Hosted-mode switch — serving refuses when false"),
        persona: z.string().max(20_000).optional().describe("Business voice + facts (≤20k chars)"),
        policies: z
          .object({})
          .passthrough()
          .optional()
          .describe(
            'Policy bag: {"loginRequirement": "none"|"optional"|"required"|"approval", ' +
              '"allowedEmailDomains"?: string[], "invitedEmails"?: string[], ' +
              '"visitorLimits"?: {"turnsPerDay", "anonymousTurnsPerDay"}, ' +
              '"language"?: a BCP-47 tag such as "he" (preferred; a name such as "Hebrew" also works) — the site language lock AND the site\'s own chrome/direction (RTL flips automatically); set in every hosted build, ' +
              '"timezone"?: IANA zone e.g. "Asia/Jerusalem" (the business clock — set in every hosted build; invalid = UTC), ' +
              '"entityLabels"?: {"<entity>": "what visitors call it, plural, in the site language"} — set for EVERY entity of a non-English site; the live site\'s activity rows ("Searched courses") show it, without it they stay English, ' +
              '"handoff"?: {"whatsapp"?, "email"?} (email = the address the owner typed, never the account email; a stored email activates the escalate_to_owner tool on the live site), ' +
              '"writePolicies"?: {"create_<entity>": "auto"|"confirm"|"off", "update_<entity>": "confirm"|"auto"} (create_ defaults to confirm; ' +
              'update_ mounts ONLY when its key is stored)} — semantics in brander://docs/hosted-agent-contract'
          ),
        homeScreen: z
          .object({})
          .passthrough()
          .optional()
          .describe("Pass {} to CLEAR the canned home screen (set one via set_home_screen)"),
        level: z
          .number()
          .int()
          .min(1)
          .max(5)
          .optional()
          .describe(
            "Answer quality, 1..5, in EXACTLY these owner words: 1 = \"Fastest & cheapest — quick answers to simple questions\", 2 = \"Fast — good for FAQs and lookups\", 3 = \"Balanced — right for most shops (default)\", 4 = \"Smart — a stronger model for harder questions\", 5 = \"Smartest & most expensive — our strongest model\". " +
              "OMIT it in a normal build. Set it ONLY when the owner explicitly asks for faster, cheaper or smarter answers. " +
              "NEVER name a model, a vendor or a price to the owner; if they name one, translate it into a stop in plain words. " +
              "Which model backs each stop is BranderUX's decision (the admin console), never the owner's. " +
              "After storing, say in one sentence which stop now answers their customers and that the Agent tab's agent card carries the same slider. get_agent_config echoes the STORED stop."
          ),
        dailyTokenBudget: z
          .number()
          .int()
          .min(1)
          .max(100_000_000)
          .optional()
          .describe("Cost-weighted tokens/day (default 2,000,000)"),
      },
      outputSchema: { config: z.object({}).passthrough() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, ...body }) => {
      const path = `/projects/${encodeURIComponent(projectId)}/agent-config`;
      // The server stores the bag whole — merge the patch over what is there so a
      // partial write (entityLabels alone) never drops language, handoff or writePolicies.
      if (isPlainObject(body.policies)) {
        const current = await api.get<Record<string, unknown>>(path);
        body.policies = mergePolicyBag(current?.policies, body.policies);
      }
      const config = await api.put<Record<string, unknown>>(path, body);
      return ok({ config: config ?? {} });
    })
  );

  server.registerTool(
    "get_agent_config",
    {
      title: "Get hosted-agent config",
      description: "Read the project's hosted-agent configuration (204/none = never configured).",
      inputSchema: { projectId: projectIdSchema },
      outputSchema: { config: z.object({}).passthrough().nullable() },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId }) => {
      const config = await api.get<Record<string, unknown>>(
        `/projects/${encodeURIComponent(projectId)}/agent-config`
      );
      return ok({ config: config ?? null });
    })
  );

  server.registerTool(
    "define_entity",
    {
      title: "Define data entity",
      description:
        "Create/replace a managed-entity definition (name → the agent's query_<name> tool). " +
        "name: ^[a-z][a-z0-9_]{0,63}$. jsonSchema needs non-empty properties with descriptions; " +
        "numeric fields (price, stock) MUST be type number. accessPolicy: public-read (default) | " +
        "end-user-scoped | owner-only — end-user-scoped reads mount ONLY with a verified visitor identity " +
        "(pick it only under loginRequirement required/approval), and NEVER pair end-user-scoped with writePolicy " +
        "open under none/optional login: anonymous rows are owner-visible only. update_<entity> is OFF by default " +
        "(mounts only via policies.writePolicies[\"update_<entity>\"] = \"confirm\"|\"auto\"). Max 20 entities/project. With `source` (from site-API " +
        "discovery) the entity is LIVE-backed: queries fetch that endpoint at serve time — do NOT " +
        "seed_records for it, and mirror the discovered sample's field names in jsonSchema. " +
        "CONTACT DETAILS: an entity collecting a phone or an email (bookings, orders, enquiries, waitlists) either carries a boolean marketingConsent field whose " +
        "description is the exact wording the visitor is shown at collection, or its list is SERVICE-ONLY — answering that person's own request is always fine, " +
        "marketing to them without recorded consent is not. " +
        "Read brander://docs/hosted-agent-contract first.",
      inputSchema: {
        projectId: projectIdSchema,
        name: entityNameSchema,
        jsonSchema: z
          .object({})
          .passthrough()
          .describe("JSON Schema object with non-empty properties"),
        accessPolicy: z.enum(["public-read", "end-user-scoped", "owner-only"]).optional(),
        writePolicy: z
          .enum(["none", "end-user-owned", "open"])
          .optional()
          .describe(
            "Write-tools: none (default, read-only) | end-user-owned (signed visitors create/update " +
              "THEIR rows — bookings/orders; needs loginRequirement required/approval) | open (any visitor, confirm-first). " +
              "Derives ONE runtime tool named literally create_<entity> (confirm-first unless the owner sets it to auto); " +
              "update_<entity> is OFF by default and mounts only when policies.writePolicies[\"update_<entity>\"] is \"confirm\"|\"auto\" (owner-approved editing). " +
              "A writable entity is NOT a working write by itself: the submit element's clickQueryTemplate must carry EVERY field and the " +
              "persona/skill must say to call create_<entity> — see hosted-agent-contract MAKING A WRITE ACTUALLY WORK."
          ),
        source: z
          .object({
            kind: z.enum([
              "shopify-products",
              "woo-store-products",
              "squarespace-products",
              "custom-rest",
            ]),
            endpoint: httpsUrlSchema,
            credentialName: z.string().optional()
              .describe("custom-rest: vaulted credential from set_connector_credential"),
            fieldMap: z
              .object({
                rows: z.string().describe("Dot-path to the row array ('' = root is the array)"),
                fields: z.record(z.union([
                  z.string(),
                  z.object({ path: z.string(), type: z.enum(["number", "string"]).optional() }),
                ])).describe("field → dot-path into a row (numbers: {path, type:'number'})"),
              })
              .optional()
              .describe("custom-rest REQUIRED: builder-authored mapping from probe_api's sample"),
          })
          .optional()
          .describe(
            "Live data source: platform kinds from discovery, or custom-rest for ANY JSON API " +
            "(probe first, then author fieldMap). Queries fetch the API live — never seed."
          ),
      },
      outputSchema: { entity: z.object({}).passthrough() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, name, jsonSchema, accessPolicy, source, writePolicy }) => {
      if (source?.kind === "custom-rest" && !source.fieldMap) {
        return fail(
          'source.kind "custom-rest" requires fieldMap — probe_api the endpoint first, then author {rows, fields} from the sample.'
        );
      }
      const entity = await api.put<Record<string, unknown>>(
        `/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(name)}`,
        {
          jsonSchema,
          ...(accessPolicy ? { accessPolicy } : {}),
          ...(source ? { source } : {}),
          ...(writePolicy ? { writePolicy } : {}),
        }
      );
      return ok({ entity: entity ?? {} });
    })
  );

  server.registerTool(
    "update_record",
    {
      title: "Update one entity record",
      description:
        "Shallow-merge fields into ONE existing record by its _id (from query results or " +
        "list_entity_records) — the path for photo-url patching and corrections. Never changes _id; " +
        "never creates records (unknown _id fails). For live-sourced entities there are no records to update.",
      inputSchema: {
        projectId: projectIdSchema,
        entityName: entityNameSchema,
        recordId: recordIdSchema.describe("The record's _id (UUID)"),
        fields: z.object({}).passthrough().describe("Fields to merge into the record"),
      },
      outputSchema: { updated: z.string() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, entityName, recordId, fields }) => {
      await api.patch(
        `/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityName)}/records/${encodeURIComponent(recordId)}`,
        { fields }
      );
      return ok({ updated: recordId });
    })
  );

  server.registerTool(
    "set_connector_credential",
    {
      title: "Vault an API credential",
      description:
        "Store ONE API credential for custom-rest live sources (booking engines, POS, inventory). " +
        "Encrypted server-side; NEVER echoed back by any tool. authKind: bearer (Authorization: " +
        "Bearer) | header (custom header via headerName) | basic (user:pass) | query (param via " +
        "headerName). After storing: probe_api with credentialName to see the real response shape.",
      inputSchema: {
        projectId: projectIdSchema,
        name: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/, "kebab-case"),
        authKind: z.enum(["bearer", "header", "basic", "query"]),
        secret: z.string().min(1).max(4096),
        headerName: z.string().max(64).optional()
          .describe("Required for header/query kinds"),
      },
      outputSchema: { credential: z.object({}).passthrough() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, name, authKind, secret, headerName }) => {
      if ((authKind === "header" || authKind === "query") && !headerName) {
        return fail(
          `authKind "${authKind}" requires headerName (the ` +
            `${authKind === "header" ? "header" : "query parameter"} that carries the secret).`
        );
      }
      const credential = await api.put<Record<string, unknown>>(
        `/projects/${encodeURIComponent(projectId)}/connectors/${encodeURIComponent(name)}`,
        { authKind, secret, ...(headerName ? { headerName } : {}) }
      );
      return ok(
        `Credential "${name}" vaulted (${authKind}). It is never shown again by any tool; ` +
          `delete/replace via this tool. Now probe_api to see the response shape.`,
        { credential: credential ?? {} }
      );
    })
  );

  server.registerTool(
    "probe_api",
    {
      title: "Probe a JSON API",
      description:
        "Fetch an https endpoint (optionally with a vaulted credential) and return status + a " +
        "TRUNCATED body sample — LOOK at the real shape, then author define_entity's custom-rest " +
        "fieldMap from it (rows path + per-field dot-paths; numeric fields as {path, type:'number'}).",
      inputSchema: {
        projectId: projectIdSchema,
        endpoint: httpsUrlSchema,
        credentialName: z.string().optional(),
      },
      outputSchema: { status: z.number(), sample: z.string() },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId, endpoint, credentialName }) => {
      const result = await api.post<{ status: number; sample: string }>(
        `/projects/${encodeURIComponent(projectId)}/connectors/probe`,
        { endpoint, ...(credentialName ? { credentialName } : {}) }
      );
      return ok({ status: result?.status ?? 0, sample: result?.sample ?? "" });
    })
  );

  server.registerTool(
    "set_home_screen",
    {
      title: "Design the home page (canned first paint)",
      description:
        "Store the DESIGNED first page — a REQUIRED step of every hosted build (without it each landing costs a model call and loads slow). " +
        "Layout decided ONCE, rows REAL on every landing. When a " +
        "visitor lands (the first custom page's query auto-fires), serve replays this with zero " +
        "model calls — but each binding's query runs LIVE (store API or managed records), so " +
        "prices/stock/items are always current. matchQuery MUST equal the first custom page's " +
        "query verbatim. screenId = an existing custom screen. data = STATIC layout/copy props " +
        "only ({elementId: props} — headers, greetings, category labels); NEVER bake product " +
        "rows into it. bindings = where the live rows go: one per data-driven element " +
        "({path: \"elementId.propName\", entityName, filters?, sort?, limit?} — e.g. on-sale " +
        "items sorted by price). Refresh when the home screen's layout changes. Empty {} " +
        "homeScreen via upsert_agent_config clears. Works in flexible (the default) and deterministic modes.",
      inputSchema: {
        projectId: projectIdSchema,
        matchQuery: z.string().min(1).max(200),
        screenId: z.string().min(1),
        data: z.object({}).passthrough()
          .describe("STATIC layout/copy props only — rows come from bindings"),
        bindings: z
          .array(
            z.object({
              path: z.string().regex(/^[a-zA-Z0-9_-]{1,64}\.[a-zA-Z][a-zA-Z0-9_]{0,63}$/),
              entityName: entityNameSchema,
              filters: z
                .array(
                  z.object({
                    field: z.string(),
                    op: z.string(),
                    value: z
                      .union([z.string(), z.number(), z.boolean()])
                      .describe("Numbers as JSON numbers — range ops (lt/gt/…) need numerics"),
                  })
                )
                .max(4)
                .optional(),
              sort: z.object({ field: z.string(), dir: z.enum(["asc", "desc"]) }).optional(),
              limit: z.number().int().min(1).max(50).optional(),
            })
          )
          .max(3)
          .optional()
          .describe("Live-row queries spliced into data at serve time"),
        followUpText: z.string().max(2000).optional()
          .describe("Optional short greeting shown ABOVE the home screen (write copy that introduces what is below it)"),
      },
      outputSchema: { homeScreen: z.object({}).passthrough() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, matchQuery, screenId, data, bindings, followUpText }) => {
      const config = await api.put<Record<string, unknown>>(
        `/projects/${encodeURIComponent(projectId)}/agent-config`,
        {
          homeScreen: {
            matchQuery,
            screenId,
            data,
            ...(bindings && bindings.length > 0 ? { bindings } : {}),
            ...(followUpText ? { followUpText } : {}),
          },
        }
      );
      return ok({ homeScreen: (config?.homeScreen as Record<string, unknown>) ?? {} });
    })
  );

  server.registerTool(
    "upsert_skill",
    {
      title: "Create/update an agent skill",
      description:
        "Create or replace ONE SKILL.md pack (markdown, ≤16k chars) that the hosted agent carries in " +
        "its prompt: domain knowledge and behavior (shipping policy, sizing guide, returns, tone " +
        "playbooks). name: kebab-case. Keep each skill focused and SHORT — every enabled skill rides " +
        "every serve call. enabled=false parks it without deleting. Max 10 skills/project.",
      inputSchema: {
        projectId: projectIdSchema,
        name: skillNameSchema,
        content: z.string().min(1).max(16_000).describe("SKILL.md markdown body"),
        enabled: z.boolean().optional(),
      },
      outputSchema: { skill: z.object({}).passthrough() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, name, content, enabled }) => {
      const skill = await api.put<Record<string, unknown>>(
        `/projects/${encodeURIComponent(projectId)}/skills/${encodeURIComponent(name)}`,
        { content, ...(enabled === undefined ? {} : { enabled }) }
      );
      return ok({ skill: skill ?? {} });
    })
  );

  server.registerTool(
    "list_skills",
    {
      title: "List agent skills",
      description: "List the project's SKILL.md packs (name, enabled, content).",
      inputSchema: { projectId: projectIdSchema },
      outputSchema: { skills: z.array(z.object({}).passthrough()) },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId }) => {
      const skills = await api.get<Record<string, unknown>[]>(
        `/projects/${encodeURIComponent(projectId)}/skills`
      );
      return ok({ skills: skills ?? [] });
    })
  );

  server.registerTool(
    "delete_skill",
    {
      title: "Delete agent skill",
      description: `Delete one SKILL.md pack. ${CONFIRM_HINT}`,
      inputSchema: {
        projectId: projectIdSchema,
        name: skillNameSchema,
        confirm: z.boolean().default(false),
      },
      outputSchema: { deleted: z.string() },
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ projectId, name, confirm }) => {
      if (!confirm) return fail(CONFIRM_HINT);
      await api.delete(
        `/projects/${encodeURIComponent(projectId)}/skills/${encodeURIComponent(name)}`
      );
      return ok({ deleted: name });
    })
  );

  server.registerTool(
    "list_entities",
    {
      title: "List data entities",
      description:
        "List the project's managed-entity definitions (schema, accessPolicy, writePolicy, source, version). " +
        "Use it to VERIFY write setup: a write-enabled entity shows writePolicy end-user-owned|open.",
      inputSchema: { projectId: projectIdSchema },
      outputSchema: { entities: z.array(z.object({}).passthrough()) },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId }) => {
      const entities = await api.get<Record<string, unknown>[]>(
        `/projects/${encodeURIComponent(projectId)}/entities`
      );
      return ok({ entities: entities ?? [] });
    })
  );

  server.registerTool(
    "seed_records",
    {
      title: "Seed entity records",
      description:
        "Bulk-insert rows into an entity (≤500/call, ≤32KB/row, ≤50k/entity). Rows are plain JSON " +
        "objects matching the entity schema — numbers as JSON numbers (never '₪120' strings), image " +
        "fields carry URLs. Mark invented demo data with _demo:true and tell the owner.",
      inputSchema: {
        projectId: projectIdSchema,
        entityName: entityNameSchema,
        rows: z.array(z.object({}).passthrough()).min(1).max(500),
      },
      outputSchema: { inserted: z.number(), totalRecords: z.number() },
      annotations: WRITE,
    },
    guarded(async ({ projectId, entityName, rows }) => {
      const result = await api.post<{ inserted: number; totalRecords: number }>(
        `/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityName)}/records/bulk`,
        { rows }
      );
      return ok({ inserted: result?.inserted ?? 0, totalRecords: result?.totalRecords ?? 0 });
    })
  );

  registerEntityRecordPeek(server, api);

  // publish_site/get_site are gated on the MCP server's OWN env: an MCP
  // deploy ahead of the client flag/DNS must not hand prod Claude Code users
  // a tool that mints LIVE sites with dead URLs.
  if (process.env.AGENTIC_APPS_ENABLED !== "1") {
    return;
  }

  server.registerTool(
    "publish_site",
    {
      title: "Publish the agentic app",
      description:
        "Publish (or rename/republish) the project's hosted agentic app at https://<slug>.branderux.app. " +
        "slug: 2-40 chars, lowercase letters/digits, inner hyphens. First publish mints the site key " +
        "automatically. Requires a configured hosted agent to be useful — configure it first. " +
        "PUBLISH IMMEDIATELY as the last build step of every hosted build — never wait to be asked: derive the slug from the " +
        "business name (rename later moves the key origin too), announce the live URL. Writes, sign-in and owner emails only run on the published site. " +
        "Publishing yields BOTH the interactive site and a SEPARATE identity-free MCP endpoint at https://<slug>.branderux.app/mcp for visiting agents: " +
        "get_business_info + query_* + generate_screen + connected-app READS (hub_*), PLUS the add-only writes the owner enabled — create_<entity> for every " +
        "writePolicy open entity unless policies.writePolicies sets it off (update_<entity> only on its explicit opt-in) and escalate_to_owner when a handoff " +
        "email is stored; never rest_* or connected-app writes, and end-user-owned entities never mount there. Those writes execute directly on the MCP client's " +
        "own approval prompt (no Confirm card) and land as anonymous rows in the Data pane. Under loginRequirement required/approval/private the /mcp endpoint " +
        "is NOT public — it refuses every assistant with a sign-in error. Its tools/list says nothing about the hosted agent's own tool belt; verify site writes " +
        "by submitting on the site itself and checking list_entity_records. " +
        "AFTER a successful publish, tell the owner BOTH addresses in plain, non-technical words: the live site, and the same address with /mcp on the end, " +
        "which is how Claude, ChatGPT and any other MCP client can now LOOK UP their business and answer about it in their brand (nothing extra to set up). " +
        "Say plainly what the /mcp address can do: look-up always, and — when writes are enabled — placing requests, orders and bookings too (the assistant " +
        "asks the person first; the record reaches the owner's Data pane or inbox); with no writes enabled say it is look-up only and orders, bookings and " +
        "requests happen on the site itself; when sign-in is required say the /mcp address is not public and make neither claim. Then give two or three things " +
        "to try first ('ask it what is in stock today', 'ask it about delivery times' — and, only when writes are enabled, 'ask it to book a table for two').",
      inputSchema: {
        projectId: projectIdSchema,
        slug: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/, "2-40 chars, lowercase, inner hyphens"),
      },
      outputSchema: { slug: z.string(), status: z.string(), url: z.string() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, slug }) => {
      const site = await api.put<{ slug: string; status: string; url: string }>(
        `/projects/${encodeURIComponent(projectId)}/site`,
        { slug }
      );
      return ok({
        slug: site?.slug ?? slug,
        status: site?.status ?? "live",
        url: site?.url ?? `https://${slug}.branderux.app`,
      });
    })
  );

  server.registerTool(
    "get_site",
    {
      title: "Get the published site",
      description:
        "Read the project's published-site state (none = never published). " +
        "When reporting it to the owner, present BOTH addresses in plain words: the live site, and the same address with /mcp on the end, where AI " +
        "assistants can look up the business and — when the owner enabled writes (open entities / a handoff email) — place requests, orders and bookings " +
        "too; under loginRequirement required/approval/private that address is not public (sign-in gated), so make neither claim.",
      inputSchema: { projectId: projectIdSchema },
      outputSchema: { site: z.object({}).passthrough().nullable() },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId }) => {
      const site = await api.get<Record<string, unknown>>(
        `/projects/${encodeURIComponent(projectId)}/site`
      );
      return ok({ site: site ?? null });
    })
  );

}

function registerEntityRecordPeek(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "list_entity_records",
    {
      title: "Peek entity records",
      description:
        "Read up to 50 records of an entity (verification after seeding). When the entity's " +
        "schema holds contact details (email/phone), the result also carries a `notice`: that " +
        "list may NOT be marketed to without the consent recorded on each row.",
      inputSchema: {
        projectId: projectIdSchema,
        entityName: entityNameSchema,
        limit: z.number().int().min(1).max(50).optional(),
      },
      outputSchema: {
        rows: z.array(z.object({}).passthrough()),
        count: z.number(),
        notice: z.string().optional(),
      },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId, entityName, limit }) => {
      const result = await api.get<{ rows: Record<string, unknown>[]; count: number }>(
        `/projects/${encodeURIComponent(projectId)}/entities/${encodeURIComponent(entityName)}/records?limit=${limit ?? 20}`
      );
      const notice = contactRecordsNotice(await entityContactFields(api, projectId, entityName));
      return ok({
        rows: result?.rows ?? [],
        count: result?.count ?? 0,
        ...(notice ? { notice } : {}),
      });
    })
  );
}

/**
 * The entity definition's contact-bearing field names. BEST EFFORT by design:
 * the notice is an addition to a read, so a failing (or absent) definition
 * lookup degrades to no notice — never to a failed peek.
 */
async function entityContactFields(
  api: ApiClient,
  projectId: string,
  entityName: string
): Promise<string[]> {
  try {
    const entities = await api.get<Record<string, unknown>[]>(
      `/projects/${encodeURIComponent(projectId)}/entities`
    );
    const entity = (entities ?? []).find((candidate) => candidate.name === entityName);
    return contactFields(entity?.jsonSchema);
  } catch {
    return [];
  }
}
