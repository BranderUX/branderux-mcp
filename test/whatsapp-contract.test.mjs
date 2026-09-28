// The WhatsApp channel's MCP surface: three tools (get_whatsapp_status,
// publish_whatsapp_forms, set_whatsapp_titles), the whatsapp-channel doc, step 8
// of THE HOSTED BUILD ARC and the one-line offer in the server instructions and
// the hosted prompt. Connecting is never a tool: it is the owner's click in
// Meta's sign-in window, so every surface says never to ask for a number, a code
// or a token TO CONNECT it, and only to connect it: as in the in-app Builder's
// WHATSAPP rule, a WhatsApp number or link for handing a customer to a person
// (policies.handoff.whatsapp) is still asked for, confirmed and stored whatever
// the channel's status. No surface names a price or an amount. Only Spring's own
// `whatsapp_not_configured` 503 reads as a closed channel (any other 503 is an
// outage), proven with Spring's exact body through the real API client, and a
// 404 is "nothing to offer" on the status read only; Spring's own 409
// `whatsapp_needs_reconnect` on the forms run answers `reconnectRequired: true`
// (any other 409 stays an error). Spring's channel on its own is no WhatsApp
// to offer: after Spring answers, the status asks the web app's own public
// switch (GET /api/whatsapp/availability, no credential), and only its explicit
// `available: true` opens it. An app without the route has no WhatsApp, however
// it answers: the sign-in redirect of an app from before WhatsApp (never
// followed: proven with the real fetch against a live loopback app), a 404, or
// a page that is not JSON; an outage stays an error. So Claude Code offers
// WhatsApp exactly where the in-app Builder does, whichever of this server and
// the app's route ships first. The status is described field for field as
// Spring's status body carries it, the send block (sendBlockedReason,
// sendBlockedAt: Meta refusing to send from a connected number) included: the
// status description names it and points at the doc, which words each reason,
// and step 8 never says a send-blocked number answers. The titles
// write merges over the stored policy bag the way upsert_agent_config does, so
// a title never drops the language lock, the handoff or the write policies; it
// can remove and replace titles, keeps at most 50, and never lets the bag pass
// the server's 8 KB. It writes nothing when the titles are already stored,
// compared as maps: Spring's jsonb column hands keys back in its own order.
// Step 8 reads a connected number's health before anything
// else, and follows the in-app Builder's WHATSAPP rule: a `disconnected` number
// is the owner's own choice (silence unless they ask, never offered again),
// never grouped with `needs_reconnect`, which is a breakage; each
// not-answering sentence and the offer come at most once per conversation, on
// the status description, the channel doc and step 8 alike. The status call
// comes before any read of the channel doc, which is read only on the way to
// an offer or upkeep, never while WhatsApp is off. The tools ride the
// same switch as publish_site, because only a
// published agent can connect. Dependency-free (node:test) like its siblings;
// zod is the server's own dependency and is how the schemas' limits are
// exercised.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { ApiError, createApiClient } from "../dist/api-client.js";
import { AppError, AppNotJsonError, createAppClient } from "../dist/app-client.js";
import { APP_BASE, CONFIG } from "../dist/config.js";
import { INSTRUCTIONS, INSTRUCTIONS_WINDOW } from "../dist/create-server.js";
import { POLICY_BAG_MAX_BYTES, policyBagBytes } from "../dist/lib/policy-bag.js";
import { IDEMPOTENT_WRITE, READ_ONLY, WRITE } from "../dist/tools/helpers.js";
import { loadDocs } from "../dist/tools/knowledge.js";
import {
  WHATSAPP_AVAILABILITY_PATH,
  WHATSAPP_NEEDS_RECONNECT,
  WHATSAPP_NOT_CONFIGURED,
  WHATSAPP_TITLES_MAX,
  WHATSAPP_TITLE_MAX,
  WHATSAPP_TITLE_QUERY_MAX,
  registerWhatsAppTools,
} from "../dist/tools/whatsapp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

/**
 * The bullets of a case list in raw doc text, each flattened and starting "- ":
 * `indent` is the list's own indentation, so a nested line never splits a case.
 */
const bulletsOf = (text, indent) =>
  text
    .split(`\n${indent}- `)
    .slice(1)
    .map((item) => flat(`- ${item}`).trim());

/** The one case in `bullets` that opens with `prefix`. */
function caseOf(bullets, prefix) {
  const found = bullets.filter((item) => item.startsWith(prefix));
  assert.equal(found.length, 1, `exactly one case opens with: ${prefix}`);
  return found[0];
}

const source = read("src/tools/whatsapp.ts");
const channelDoc = read("src/docs/whatsapp-channel.md");
const hosted = read("src/docs/hosted-agent-contract.md");
const prompts = read("src/prompts.ts");
const server = read("src/create-server.ts");

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";
const CONFIG_PATH = `/projects/${PROJECT}/agent-config`;
const STATUS_PATH = `/projects/${PROJECT}/whatsapp`;
const PUBLISH_PATH = `${STATUS_PATH}/flows/publish`;
const TOOL_NAMES = ["get_whatsapp_status", "publish_whatsapp_forms", "set_whatsapp_titles"];

/** Money on a WhatsApp surface: a currency sign or word, or Meta's free-tier count. */
const MONEY = /[$₪€£¢]|\bagorot\b|\bshekels?\b|\bdollars?\b|\bcents?\b|\bUSD\b|\bILS\b|\bNIS\b|1,000|\b1000\b/i;

/** The ApiError the API client throws for a failed call (its message format, api-client.ts). */
const apiError = (method, path, status, detail) => new ApiError(status, `${method} ${path} → ${status}: ${detail}`);

/**
 * Spring's status body for a connected number, every field it carries, in its
 * order (branderux-server WhatsAppController.statusBody: GET
 * /projects/{id}/whatsapp). The last two are the channel's send block (V73):
 * null while Meta sends from the number.
 */
const SPRING_STATUS = {
  connected: true,
  status: "active",
  displayPhone: "972501234567",
  displayName: "Blossom Flowers",
  quality: "GREEN",
  tier: "TIER_2K",
  messagingLimit: "TIER_2K",
  pauseHours: 4,
  coexistence: true,
  flows: ["bookings"],
  blockedReason: null,
  connectedAt: "2026-09-24T08:00:00Z",
  smbSyncRequestedAt: "2026-09-24T08:00:00Z",
  sendBlockedReason: null,
  sendBlockedAt: null,
};

/**
 * The owner status's send-block reasons (branderux-server whatsapp/SendBlock,
 * V73's CHECK): why Meta refuses to send anything from a connected number. The
 * worker's route answers them under a `meta_` prefix; the owner status never does.
 */
const SEND_BLOCK_REASONS = ["payment_required", "account_restricted", "not_registered"];

/** The same number while Meta refuses to send from it: still `active`, not answering. */
const SPRING_STATUS_SEND_BLOCKED = {
  ...SPRING_STATUS,
  sendBlockedReason: "payment_required",
  sendBlockedAt: "2026-09-26T09:15:00Z",
};

/**
 * The exact body every Spring WhatsApp endpoint answers, with a 503, while the
 * channel is off on that server (branderux-server WhatsAppChannelOffTest pins it
 * key for key; the timestamp is the clock). It has no error_description, which
 * the API client would word the ApiError from instead of from `error`.
 */
const SPRING_CHANNEL_OFF = {
  timestamp: "2026-09-25T09:30:00.123456",
  status: 503,
  error: "whatsapp_not_configured",
  code: "whatsapp_not_configured",
  message: "WhatsApp is not configured on this server",
  retryable: false,
};

/**
 * Runs `run` with the REAL API client (api-client.ts) over a stubbed fetch that
 * answers every call with `status` and the raw `text` (no network), and the
 * calls the stub saw.
 */
async function againstSpring(status, text, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push(`${init.method ?? "GET"} ${url}`);
    return new Response(text, { status, headers: { "Content-Type": "application/json" } });
  };
  try {
    await run(createApiClient(async () => "api-audience-token"), calls);
  } finally {
    globalThis.fetch = original;
  }
}

/** A fake ApiClient recording every call; `config` answers the agent-config GET, `status` the channel GET. */
function fakeApi({
  config = { policies: {} },
  status = {},
  published = {},
  getThrows = null,
  postThrows = null,
} = {}) {
  const calls = { get: [], put: [], post: [] };
  return {
    calls,
    get: async (path) => {
      calls.get.push(path);
      if (getThrows) throw getThrows;
      return path.endsWith("/agent-config") ? config : status;
    },
    put: async (path, body) => {
      calls.put.push({ path, body });
      return { ...(config ?? {}), ...body };
    },
    post: async (path, body) => {
      calls.post.push({ path, body });
      if (postThrows) throw postThrows;
      return published;
    },
  };
}

/**
 * A fake AppClient: `answer` is what the web app's public WhatsApp switch
 * (GET /api/whatsapp/availability) says, `throws` how that read fails, and
 * `calls` records every read. By default the app HAS WhatsApp for owners, so a
 * test about Spring's side reads Spring's answer alone.
 */
function fakeApp({ answer = { available: true }, throws = null } = {}) {
  const calls = [];
  return {
    calls,
    getPublic: async (path) => {
      calls.push(path);
      if (throws) throw throws;
      return answer;
    },
    post: async () => {
      throw new Error("no WhatsApp tool posts to the web app");
    },
  };
}

/** Register the WhatsApp tools on a fake McpServer with the agentic-apps switch as given (null = unset). */
function register(api, flag = "1", app = fakeApp()) {
  const previous = process.env.AGENTIC_APPS_ENABLED;
  if (flag === null) delete process.env.AGENTIC_APPS_ENABLED;
  else process.env.AGENTIC_APPS_ENABLED = flag;
  try {
    const tools = new Map();
    registerWhatsAppTools(
      { registerTool: (name, config, handler) => tools.set(name, { config, handler }) },
      api,
      app
    );
    return tools;
  } finally {
    if (previous === undefined) delete process.env.AGENTIC_APPS_ENABLED;
    else process.env.AGENTIC_APPS_ENABLED = previous;
  }
}

function tool(name, api = fakeApi(), app = fakeApp()) {
  const entry = register(api, "1", app).get(name);
  assert.ok(entry, `${name} is registered`);
  return entry;
}

/** The structured result must pass the tool's own outputSchema, or the SDK rejects the call. */
function assertMatchesOutput(entry, result) {
  const parsed = z.object(entry.config.outputSchema).safeParse(result.structuredContent);
  assert.equal(parsed.success, true, parsed.success ? "" : parsed.error.message);
}

/** set_whatsapp_titles against a stored config; returns the fake API and the result. */
async function setTitles(config, args) {
  const api = fakeApi({ config });
  const result = await tool("set_whatsapp_titles", api).handler({ projectId: PROJECT, ...args });
  return { api, result };
}

/**
 * A value's object keys in the order PostgreSQL's jsonb hands them back, at
 * every level: shorter keys first by UTF-8 byte length, equal lengths by byte
 * value (jsonb_util.c, lengthCompareJsonbString). Spring keeps the policy bag
 * in a jsonb column (branderux-server AgentConfig.policies), so a read never
 * returns the order the bag was written in. (No integer-like keys here: a JS
 * object would put those first whatever the sort.)
 */
function jsonbOrder(value) {
  if (Array.isArray(value)) return value.map(jsonbOrder);
  if (value === null || typeof value !== "object") return value;
  const utf8 = (key) => Buffer.from(key, "utf8");
  const keys = Object.keys(value).sort(
    (a, b) => utf8(a).length - utf8(b).length || Buffer.compare(utf8(a), utf8(b))
  );
  return Object.fromEntries(keys.map((key) => [key, jsonbOrder(value[key])]));
}

/**
 * A fake Spring over one agent-config row: a PUT stores its body, and every
 * read (the GET, and the PUT's reply) comes back in jsonb's key order, as the
 * real server's does. `puts` records the bodies written.
 */
function springWithJsonb(policies) {
  let row = { enabled: true, policies: structuredClone(policies) };
  const puts = [];
  return {
    puts,
    get: async () => jsonbOrder(structuredClone(row)),
    put: async (_path, body) => {
      puts.push(structuredClone(body));
      row = { ...row, ...structuredClone(body) };
      return jsonbOrder(structuredClone(row));
    },
    post: async () => ({}),
  };
}

// --- registration ------------------------------------------------------------

test("three tools register, each with the annotation set the spec gives it", () => {
  const tools = register(fakeApi());
  assert.deepEqual([...tools.keys()].sort(), [...TOOL_NAMES].sort());
  assert.deepEqual(tools.get("get_whatsapp_status").config.annotations, READ_ONLY);
  assert.deepEqual(tools.get("publish_whatsapp_forms").config.annotations, WRITE);
  assert.deepEqual(tools.get("set_whatsapp_titles").config.annotations, IDEMPOTENT_WRITE);
});

test("they ride publish_site's switch: with agentic apps off, no WhatsApp tool registers", () => {
  assert.equal(register(fakeApi(), null).size, 0);
  assert.equal(register(fakeApi(), "0").size, 0);
  const gate = /if \(process\.env\.AGENTIC_APPS_ENABLED !== "1"\) \{\s*return;\s*\}/;
  assert.match(read("src/tools/agent.ts"), gate, "the gate publish_site sits behind");
  assert.match(source, gate, "the same gate, spelled the same way");
});

test("create-server registers them right after the agent tools, with the web app's client", () => {
  assert.match(server, /import \{ registerWhatsAppTools \} from "\.\/tools\/whatsapp\.js";/);
  assert.match(server, /const app = createAppClient\(apiTokenProvider\);/);
  assert.match(server, /registerAgentTools\(server, api, app\);\n\s*registerWhatsAppTools\(server, api, app\);/);
});

test("every tool takes the project as projectId, a UUID (the in-app Builder forces its session's project onto it)", () => {
  for (const name of TOOL_NAMES) {
    const projectId = tool(name).config.inputSchema.projectId;
    assert.ok(projectId, `${name} declares projectId`);
    assert.equal(projectId.safeParse(PROJECT).success, true);
    assert.equal(projectId.safeParse("my-project").success, false);
  }
});

// --- set_whatsapp_titles: the schema -------------------------------------------

test("a title is one line of at most 24 characters or null, keyed by a query of at most 200, and a call carries up to 50", () => {
  assert.equal(WHATSAPP_TITLE_MAX, 24);
  assert.equal(WHATSAPP_TITLES_MAX, 50);
  assert.equal(WHATSAPP_TITLE_QUERY_MAX, 200, "the matchQuery cap a chip's query shares");
  const schema = z.object(tool("set_whatsapp_titles").config.inputSchema);
  const entry = (title, query = "what is on the menu today?") => ({ query, title });
  const parse = (titles, extra = {}) => schema.safeParse({ projectId: PROJECT, titles, ...extra });
  const many = (count) => Array.from({ length: count }, (_, index) => entry("Menu", `question ${index}`));

  assert.equal(parse([entry("x".repeat(24))]).success, true);
  assert.equal(parse([entry("x".repeat(25))]).success, false);
  assert.equal(parse([entry("א".repeat(24))]).success, true, "Hebrew counts letter by letter");
  assert.equal(parse([entry("א".repeat(25))]).success, false);
  assert.equal(parse([entry("מה בתפריט היום")]).success, true);
  assert.equal(parse([entry("")]).success, false);
  assert.equal(parse([entry("   ")]).success, false, "a blank title is no title");
  assert.equal(parse([entry("two\nlines")]).success, false);
  assert.equal(parse([entry(`  ${"x".repeat(24)}  `)]).success, true, "outer spaces are trimmed before the count");
  assert.equal(parse([entry("  Our menu  ")]).data.titles[0].title, "Our menu");
  assert.equal(parse([entry(null)]).success, true, "null removes a title");
  assert.equal(parse([entry("Menu", "")]).success, false, "a title needs the chip's query");
  assert.equal(parse([entry("Menu", "q".repeat(200))]).success, true);
  assert.equal(parse([entry("Menu", "q".repeat(201))]).success, false, "no query is longer than a matchQuery");
  assert.equal(parse(many(50)).success, true);
  assert.equal(parse(many(51)).success, false);
  assert.equal(parse([], { replace: true }).success, true, "an empty set is how replace clears them");
  assert.equal(parse([entry("Menu")], { replace: "yes" }).success, false);
});

// --- set_whatsapp_titles: the write --------------------------------------------

test("the titles MERGE into policies.whatsappTitles and the rest of the bag stays as stored", async () => {
  const stored = {
    language: "he",
    handoff: { email: "owner@example.com" },
    writePolicies: { create_bookings: "confirm" },
    whatsappTitles: { "what are your opening hours?": "Opening hours", "show me the menu": "Menu" },
  };
  const api = fakeApi({ config: { enabled: true, persona: "A flower shop in Ashdod", policies: stored } });
  const entry = tool("set_whatsapp_titles", api);
  const result = await entry.handler({
    projectId: PROJECT,
    titles: [
      { query: "show me the menu", title: "התפריט שלנו" },
      { query: "do you deliver to ashdod and the towns around it?", title: "Delivery areas" },
    ],
  });
  assert.notEqual(result.isError, true);
  assert.deepEqual(api.calls.get, [CONFIG_PATH], "one read of the stored config");
  assert.equal(api.calls.put.length, 1, "exactly one write");
  assert.equal(api.calls.put[0].path, CONFIG_PATH);
  assert.deepEqual(Object.keys(api.calls.put[0].body), ["policies"], "only the bag rides; persona and the rest stay as stored");
  const expected = {
    "what are your opening hours?": "Opening hours",
    "show me the menu": "התפריט שלנו",
    "do you deliver to ashdod and the towns around it?": "Delivery areas",
  };
  assert.deepEqual(api.calls.put[0].body.policies, {
    language: "he",
    handoff: { email: "owner@example.com" },
    writePolicies: { create_bookings: "confirm" },
    whatsappTitles: expected,
  });
  assert.deepEqual(result.structuredContent, { whatsappTitles: expected });
  assertMatchesOutput(entry, result);
});

test("the same call twice leaves the same bag (IDEMPOTENT_WRITE is true), and the second writes nothing", async () => {
  for (const replace of [undefined, true]) {
    let stored = { enabled: true, policies: { language: "he", whatsappTitles: { "old chip": "Old" } } };
    const bodies = [];
    const api = {
      get: async () => structuredClone(stored),
      put: async (_path, body) => {
        bodies.push(structuredClone(body));
        stored = { ...stored, ...body };
        return structuredClone(stored);
      },
      post: async () => ({}),
    };
    const call = { projectId: PROJECT, titles: [{ query: "show me the menu", title: "Menu" }], replace };
    const handler = tool("set_whatsapp_titles", api).handler;
    const first = await handler(call);
    const second = await handler(call);
    assert.equal(bodies.length, 1, "the repeat changes nothing, so it writes nothing");
    const titles = replace ? { "show me the menu": "Menu" } : { "old chip": "Old", "show me the menu": "Menu" };
    assert.deepEqual(stored.policies, { language: "he", whatsappTitles: titles });
    assert.deepEqual(second.structuredContent, first.structuredContent);
    assert.deepEqual(second.structuredContent, { whatsappTitles: titles });
  }
});

test("a call that changes nothing writes nothing: the same set replaced, a title already gone, an empty replace with none stored", async () => {
  const stored = { language: "he", whatsappTitles: { "show me the menu": "Menu" } };
  for (const [policies, args] of [
    [stored, { replace: true, titles: [{ query: "show me the menu", title: "Menu" }] }],
    [stored, { titles: [{ query: "show me the menu", title: "Menu" }] }],
    [stored, { titles: [{ query: "a chip that has no title", title: null }] }],
    [{ language: "he" }, { replace: true, titles: [] }],
    [{ language: "he", whatsappTitles: null }, { replace: true, titles: [] }],
    [{ language: "he", whatsappTitles: {} }, { replace: true, titles: [] }],
  ]) {
    const { api, result } = await setTitles({ policies }, args);
    assert.notEqual(result.isError, true);
    assert.deepEqual(api.calls.get, [CONFIG_PATH], "it still reads");
    assert.deepEqual(api.calls.put, [], `no write for ${JSON.stringify(args)}`);
    assert.deepEqual(result.structuredContent, { whatsappTitles: policies.whatsappTitles ?? {} });
  }
});

/** A home's chips in their order on the site, the longer query first, with their WhatsApp titles. */
const HOME_CHIPS = [
  { query: "Do you deliver to Ashdod and the towns around it?", title: "Delivery areas" },
  { query: "What are your opening hours today?", title: "Opening hours" },
];

test("the server reads titles back in jsonb's key order: every later wrap-up's replace of the unchanged home writes nothing", async () => {
  const api = springWithJsonb({ language: "en", handoff: { email: "owner@example.com" } });
  const handler = tool("set_whatsapp_titles", api).handler;
  const first = await handler({ projectId: PROJECT, titles: HOME_CHIPS, replace: true });
  assert.notEqual(first.isError, true);
  assert.equal(api.puts.length, 1, "the first wrap-up stores the titles");
  const stored = (await api.get()).policies.whatsappTitles;
  assert.deepEqual(
    Object.keys(stored),
    [HOME_CHIPS[1].query, HOME_CHIPS[0].query],
    "the shorter query comes back first, not in the chips' order"
  );

  // Step 8 sends the home's whole current set with replace: true at every
  // wrap-up; the set is the same, only the order the server reads it back in
  // differs. A needless PUT would send the whole bag it just read, over any
  // policy the owner saved in between.
  for (const [titles, replace] of [
    [HOME_CHIPS, true],
    [[...HOME_CHIPS].reverse(), true],
    [HOME_CHIPS, undefined],
  ]) {
    const again = await handler({ projectId: PROJECT, titles, replace });
    assert.notEqual(again.isError, true);
    assert.deepEqual(again.structuredContent, { whatsappTitles: Object.fromEntries(HOME_CHIPS.map((c) => [c.query, c.title])) });
  }
  assert.equal(api.puts.length, 1, "nothing changed, so nothing was written again");
});

test("with the server's jsonb order, a changed title, a new query or a gone one is still written, as exactly the new set", async () => {
  const stored = Object.fromEntries(HOME_CHIPS.map((chip) => [chip.query, chip.title]));
  const [deliver, hours] = HOME_CHIPS.map((chip) => chip.query);
  const booking = "Can I book a table for tonight?";
  for (const [args, expected] of [
    [
      { replace: true, titles: [{ query: deliver, title: "Delivery" }, { query: hours, title: "Opening hours" }] },
      { [hours]: "Opening hours", [deliver]: "Delivery" },
    ],
    [{ replace: true, titles: [{ query: deliver, title: "Delivery areas" }] }, { [deliver]: "Delivery areas" }],
    [{ titles: [{ query: booking, title: "Book a table" }] }, { ...stored, [booking]: "Book a table" }],
    [{ titles: [{ query: hours, title: null }] }, { [deliver]: "Delivery areas" }],
    [{ replace: true, titles: [] }, undefined],
  ]) {
    const api = springWithJsonb({ language: "en", whatsappTitles: stored });
    const result = await tool("set_whatsapp_titles", api).handler({ projectId: PROJECT, ...args });
    assert.notEqual(result.isError, true);
    assert.equal(api.puts.length, 1, `written: ${JSON.stringify(args)}`);
    assert.deepEqual(api.puts[0].policies.whatsappTitles, expected);
    assert.equal(api.puts[0].policies.language, "en", "the rest of the bag rides along untouched");
  }
});

test("a bag with no titles yet starts from the new ones; anything but a string under the key is not carried", async () => {
  const fresh = await setTitles({ enabled: true }, { titles: [{ query: "show me the menu", title: "Menu" }] });
  assert.deepEqual(fresh.api.calls.put[0].body.policies, { whatsappTitles: { "show me the menu": "Menu" } });

  const junk = await setTitles(
    { policies: { language: "he", whatsappTitles: { a: 5, b: "Bee" } } },
    { titles: [{ query: "c", title: "Sea" }] }
  );
  assert.deepEqual(junk.api.calls.put[0].body.policies, { language: "he", whatsappTitles: { b: "Bee", c: "Sea" } });
});

test("a title of null removes that query's title; removing the last one drops the key from the bag", async () => {
  const stored = { language: "he", whatsappTitles: { "show me the menu": "Menu", "gone chip": "Gone" } };
  const { api, result } = await setTitles({ policies: stored }, { titles: [{ query: "gone chip", title: null }] });
  assert.notEqual(result.isError, true);
  assert.deepEqual(api.calls.put[0].body.policies, { language: "he", whatsappTitles: { "show me the menu": "Menu" } });

  const last = await setTitles(
    { policies: { language: "he", whatsappTitles: { "gone chip": "Gone" } } },
    { titles: [{ query: "gone chip", title: null }] }
  );
  assert.deepEqual(last.api.calls.put[0].body.policies, { language: "he" }, "no empty map is stored");
  assert.deepEqual(last.result.structuredContent, { whatsappTitles: {} });
});

test("replace: true makes the call's titles the whole set, and an empty replace clears them all", async () => {
  const stored = {
    language: "he",
    handoff: { email: "owner@example.com" },
    whatsappTitles: { "an old chip": "Old", "show me the menu": "Menu" },
  };
  const { api, result } = await setTitles(
    { policies: stored },
    {
      replace: true,
      titles: [
        { query: "show me the menu", title: "התפריט" },
        { query: "a chip being dropped anyway", title: null },
      ],
    }
  );
  assert.notEqual(result.isError, true);
  assert.deepEqual(api.calls.put[0].body.policies, {
    language: "he",
    handoff: { email: "owner@example.com" },
    whatsappTitles: { "show me the menu": "התפריט" },
  });

  const cleared = await setTitles({ policies: stored }, { replace: true, titles: [] });
  assert.notEqual(cleared.result.isError, true);
  assert.deepEqual(cleared.api.calls.put[0].body.policies, {
    language: "he",
    handoff: { email: "owner@example.com" },
  });
});

test("an empty list without replace is refused, and nothing is read or written", async () => {
  const { api, result } = await setTitles({ policies: { language: "he" } }, { titles: [] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /replace: true with an empty list/);
  assert.deepEqual(api.calls.get, []);
  assert.deepEqual(api.calls.put, []);
});

test("at most 50 titles are kept: a merge past it is refused and nothing is written; a replace is how to shrink the set", async () => {
  const whatsappTitles = Object.fromEntries(Array.from({ length: 45 }, (_, index) => [`old chip ${index}`, "Old"]));
  const fresh = Array.from({ length: 6 }, (_, index) => ({ query: `new chip ${index}`, title: "New" }));
  const { api, result } = await setTitles({ policies: { whatsappTitles } }, { titles: fresh });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /keep 51 WhatsApp titles; the most is 50/);
  assert.match(result.content[0].text, /replace: true/);
  assert.match(result.content[0].text, /Nothing was stored/);
  assert.deepEqual(api.calls.put, []);

  const replaced = await setTitles({ policies: { whatsappTitles } }, { titles: fresh, replace: true });
  assert.notEqual(replaced.result.isError, true);
  assert.equal(Object.keys(replaced.api.calls.put[0].body.policies.whatsappTitles).length, 6);

  const exactly = await setTitles({ policies: { whatsappTitles } }, { titles: fresh.slice(0, 5) });
  assert.notEqual(exactly.result.isError, true, "50 is allowed");
});

test("the bag is measured in UTF-8 bytes the way the server measures it", () => {
  assert.equal(POLICY_BAG_MAX_BYTES, 8192, "AgentConfigService.MAX_POLICIES_BYTES");
  assert.equal(policyBagBytes({ a: "b" }), '{"a":"b"}'.length);
  assert.equal(policyBagBytes({ a: "א" }), '{"a":""}'.length + 2, "a Hebrew letter is two bytes");
});

test("titles that would take the bag past the server's 8 KB are refused before the write, with what to do", async () => {
  // A long Hebrew privacy text leaves little room: the bag fits without titles and does not with them.
  const policies = { language: "he", privacyText: "א".repeat(4030) };
  const titles = [{ query: "מה שעות הפתיחה שלכם בסוף השבוע ובחגים?", title: "שעות פתיחה בסוף השבוע" }];
  assert.ok(policyBagBytes(policies) <= POLICY_BAG_MAX_BYTES, "the stored bag itself fits");
  const { api, result } = await setTitles({ policies }, { titles });
  assert.equal(result.isError, true);
  const text = result.content[0].text;
  assert.match(text, /past the 8192-byte limit the server enforces, so nothing was stored/);
  assert.match(text, new RegExp(`the other policies take ${policyBagBytes(policies)}\\)`));
  assert.match(text, /replace: true/);
  assert.deepEqual(api.calls.put, [], "the doomed write is never sent");

  const roomy = await setTitles({ policies: { language: "he", privacyText: "א".repeat(3000) } }, { titles });
  assert.notEqual(roomy.result.isError, true, "the same titles fit a smaller bag");
});

test("a project with no hosted agent is refused, and nothing is written", async () => {
  const { api, result } = await setTitles(null, { titles: [{ query: "show me the menu", title: "Menu" }] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /no hosted agent yet/);
  assert.deepEqual(api.calls.put, []);
});

test("any query is an ordinary key, including one named like an object's own property", async () => {
  const { api } = await setTitles({ policies: {} }, { titles: [{ query: "__proto__", title: "Odd" }] });
  const stored = api.calls.put[0].body.policies.whatsappTitles;
  assert.equal(Object.getOwnPropertyDescriptor(stored, "__proto__")?.value, "Odd");
  assert.equal(JSON.stringify(stored), '{"__proto__":"Odd"}');
});

// --- get_whatsapp_status ---------------------------------------------------------

test("the status reads GET /projects/{id}/whatsapp and passes the server's report through, every field", async () => {
  const api = fakeApi({ status: SPRING_STATUS });
  const app = fakeApp();
  const entry = tool("get_whatsapp_status", api, app);
  const result = await entry.handler({ projectId: PROJECT });
  assert.notEqual(result.isError, true);
  assert.deepEqual(api.calls.get, [STATUS_PATH]);
  assert.deepEqual(app.calls, [WHATSAPP_AVAILABILITY_PATH], "and the web app's own switch, which says it has WhatsApp");
  assert.deepEqual(result.structuredContent, { available: true, whatsapp: SPRING_STATUS });
  assertMatchesOutput(entry, result);
  assert.deepEqual(api.calls.put, [], "a read writes nothing");
  assert.deepEqual(api.calls.post, []);
});

test("a send block reaches the model whole: an active number Meta refuses to send from keeps its reason and time", async () => {
  // Through the real API client, so a JSON body with the two fields set, and
  // with them null, parses into exactly what the model reads.
  for (const body of [SPRING_STATUS_SEND_BLOCKED, SPRING_STATUS]) {
    await againstSpring(200, JSON.stringify(body), async (api, calls) => {
      const entry = tool("get_whatsapp_status", api);
      const result = await entry.handler({ projectId: PROJECT });
      assert.notEqual(result.isError, true);
      assert.deepEqual(result.structuredContent, { available: true, whatsapp: body });
      assert.deepEqual(JSON.parse(result.content[0].text), { available: true, whatsapp: body });
      assertMatchesOutput(entry, result);
      assert.deepEqual(calls, [`GET ${CONFIG.apiBase}${STATUS_PATH}`]);
    });
  }
  assert.equal(SPRING_STATUS_SEND_BLOCKED.status, "active", "a send block leaves the status as it is");
  assert.equal(SPRING_STATUS_SEND_BLOCKED.blockedReason, null, "and never rides blockedReason");
});

test("Spring's exact channel-off body, through the real API client, reads as NOT OPEN on both tools that call Spring", async () => {
  await againstSpring(503, JSON.stringify(SPRING_CHANNEL_OFF), async (api, calls) => {
    const status = tool("get_whatsapp_status", api);
    const read = await status.handler({ projectId: PROJECT });
    assert.notEqual(read.isError, true, "a switched-off channel is a fact to act on");
    assert.deepEqual(read.structuredContent, {
      available: false,
      whatsapp: null,
      reason: `GET ${STATUS_PATH} → 503: whatsapp_not_configured`,
    });
    assert.match(read.content[0].text, /not open on BranderUX yet/);
    assert.match(read.content[0].text, /Say nothing about WhatsApp to the owner/);
    assertMatchesOutput(status, read);

    const forms = await tool("publish_whatsapp_forms", api).handler({ projectId: PROJECT });
    assert.equal(forms.isError, true);
    assert.match(forms.content[0].text, /not open on BranderUX yet/);

    assert.deepEqual(calls, [`GET ${CONFIG.apiBase}${STATUS_PATH}`, `POST ${CONFIG.apiBase}${PUBLISH_PATH}`]);
  });
});

test("through the real API client, any other 503 (a proxy's text, Spring's generic error body) stays an error", async () => {
  const proxy = "upstream connect error or disconnect/reset before headers. reset reason: connection failure";
  const generic = { timestamp: "2026-09-25T09:30:00.123456", status: 503, error: "Service Unavailable", message: "Try again later" };
  for (const [text, detail] of [
    [proxy, proxy],
    [JSON.stringify(generic), "Service Unavailable"],
  ]) {
    await againstSpring(503, text, async (api) => {
      const read = await tool("get_whatsapp_status", api).handler({ projectId: PROJECT });
      assert.equal(read.isError, true, `${detail} surfaces`);
      assert.equal(read.content[0].text, `GET ${STATUS_PATH} → 503: ${detail}`);
      const forms = await tool("publish_whatsapp_forms", api).handler({ projectId: PROJECT });
      assert.equal(forms.isError, true);
      assert.equal(forms.content[0].text, `POST ${PUBLISH_PATH} → 503: ${detail}`);
    });
  }
});

test("Spring's own whatsapp_not_configured 503 reads as NOT OPEN, never as an error", async () => {
  assert.equal(WHATSAPP_NOT_CONFIGURED, "whatsapp_not_configured", "WhatsAppProperties.ERROR_NOT_CONFIGURED");
  const api = fakeApi({ getThrows: apiError("GET", STATUS_PATH, 503, WHATSAPP_NOT_CONFIGURED) });
  const entry = tool("get_whatsapp_status", api);
  const result = await entry.handler({ projectId: PROJECT });
  assert.notEqual(result.isError, true, "a switched-off channel is a fact to act on");
  assert.equal(result.structuredContent.available, false);
  assert.equal(result.structuredContent.whatsapp, null);
  assert.match(result.structuredContent.reason, /503: whatsapp_not_configured/);
  assert.match(result.content[0].text, /not open on BranderUX yet/);
  assert.match(result.content[0].text, /Say nothing about WhatsApp to the owner/);
  assertMatchesOutput(entry, result);
});

test("a 404 on the status read means nothing to offer, worded without claiming a cause", async () => {
  const api = fakeApi({ getThrows: apiError("GET", STATUS_PATH, 404, "Not Found") });
  const entry = tool("get_whatsapp_status", api);
  const result = await entry.handler({ projectId: PROJECT });
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.available, false);
  assert.equal(result.structuredContent.whatsapp, null);
  assert.match(result.structuredContent.reason, /404: Not Found/);
  const text = result.content[0].text;
  assert.match(text, /No WhatsApp status came back for this project/);
  assert.match(text, /a server without the WhatsApp channel, or a project it does not know/);
  assert.match(text, /Say nothing about WhatsApp to the owner/);
  assert.doesNotMatch(text, /not open on BranderUX/, "a 404 is not the product's closed channel");
  assertMatchesOutput(entry, result);
});

test("any other failure stays an error: an outage's 503, a missing scope or a server error is not a closed channel", async () => {
  for (const [status, detail] of [
    [503, "upstream connect error or disconnect/reset before headers"],
    [503, "Service Unavailable"],
    [401, "refused"],
    [403, "refused"],
    [500, "Internal server error"],
  ]) {
    const api = fakeApi({ getThrows: apiError("GET", STATUS_PATH, status, detail) });
    const result = await tool("get_whatsapp_status", api).handler({ projectId: PROJECT });
    assert.equal(result.isError, true, `${status} ${detail} surfaces`);
    assert.match(result.content[0].text, new RegExp(`→ ${status}: `));
    assert.doesNotMatch(result.content[0].text, /not open on BranderUX|Say nothing about WhatsApp/);
  }
});

// --- get_whatsapp_status: the web app's own switch ---------------------------------
//
// Spring's channel on its own is no WhatsApp to offer. The owner connects a
// number and looks after it only in the web app (the Agent tab's WhatsApp row,
// the in-app Builder's card), which has them only where both Embedded Signup
// ids were built in AND its own channel is on (the client's
// builderWhatsAppOn()). In a partial rollout (Spring's secrets set, the app
// not rebuilt with the public ids, or without its queue) the in-app Builder
// hands the model no WhatsApp tool at all; the status read says
// `available: false` in that same state, so Claude Code never offers WhatsApp
// and never sends an owner to a WhatsApp row that is not there.

/** Spring's status body for a project that never connected (WhatsAppChannelService.statusOf, no channel row). */
const SPRING_NEVER_CONNECTED = {
  connected: false,
  status: null,
  displayPhone: null,
  displayName: null,
  quality: null,
  tier: null,
  messagingLimit: null,
  pauseHours: 4,
  coexistence: false,
  flows: [],
  blockedReason: null,
  connectedAt: null,
  smbSyncRequestedAt: null,
  sendBlockedReason: null,
  sendBlockedAt: null,
};

test("Spring on, the app's WhatsApp off (a partial rollout): available: false, so step 8 never reaches the offer", async () => {
  // The finding's scenario: Spring answers 200 for a project that never
  // connected, which on its own read as `available: true`, and step 8's
  // "not connected yet" case then offered WhatsApp and pointed the owner at an
  // Agent-tab row that does not exist. A connected number reads the same way:
  // the in-app Builder is silent about it in this state too.
  for (const status of [SPRING_NEVER_CONNECTED, SPRING_STATUS]) {
    const api = fakeApi({ status });
    const app = fakeApp({ answer: { available: false } });
    const entry = tool("get_whatsapp_status", api, app);
    const result = await entry.handler({ projectId: PROJECT });
    assert.notEqual(result.isError, true, "a closed half is a fact to act on, not a failure");
    assert.deepEqual(result.structuredContent, {
      available: false,
      whatsapp: null,
      reason: `GET ${WHATSAPP_AVAILABILITY_PATH} → {"available":false}`,
    });
    assert.match(result.content[0].text, /not open on BranderUX yet/);
    assert.match(result.content[0].text, /no WhatsApp here to offer or look after/);
    assert.match(result.content[0].text, /Say nothing about WhatsApp to the owner/);
    assert.doesNotMatch(result.content[0].text, /Agent tab|connect/i, "nothing points the owner at a row that is not there");
    assertMatchesOutput(entry, result);
    assert.deepEqual(api.calls.get, [STATUS_PATH]);
    assert.deepEqual(app.calls, [WHATSAPP_AVAILABILITY_PATH]);
    assert.deepEqual(api.calls.put, [], "nothing is written");
    assert.deepEqual(api.calls.post, []);
  }
});

/**
 * Where an app from before WhatsApp sends the switch's path (BranderUX-client
 * fa16193b, the base of this work): its middleware has no public
 * /api/whatsapp, so a request with no session cookie is redirected (307) to
 * the sign-in page, a 200 HTML page, with the absolute Location Next 14.2's
 * middleware writes. `origin` is the app's own.
 */
const signInOf = (origin) => `${origin}/auth/signin?callbackUrl=%2Fapi%2Fwhatsapp%2Favailability`;

test("an app without the switch's route has no WhatsApp for owners, however it answers: a redirect, a 404, a page that is not JSON", async () => {
  const path = WHATSAPP_AVAILABILITY_PATH;
  for (const failure of [
    // An app from before WhatsApp: its sign-in redirect.
    new AppError(307, `GET ${path} → 307: redirect to ${signInOf(APP_BASE)}`),
    // No redirect is the route answering (another host, an http base, a slash rule).
    ...[300, 301, 302, 303, 308].map(
      (status) => new AppError(status, `GET ${path} → ${status}: redirect to ${APP_BASE}/elsewhere`)
    ),
    // An app that lets /api/whatsapp through, without this route.
    new AppError(404, `GET ${path} → 404: Not Found`),
    // A page served in the route's place.
    new AppNotJsonError(200, `GET ${path} → 200: not JSON: <!DOCTYPE html><title>Sign in</title>`),
  ]) {
    const api = fakeApi({ status: SPRING_NEVER_CONNECTED });
    const entry = tool("get_whatsapp_status", api, fakeApp({ throws: failure }));
    const result = await entry.handler({ projectId: PROJECT });
    assert.notEqual(result.isError, true, `${failure.message}: a closed switch, not a failure`);
    assert.deepEqual(result.structuredContent, { available: false, whatsapp: null, reason: failure.message });
    assert.match(result.content[0].text, /Say nothing about WhatsApp to the owner/);
    assertMatchesOutput(entry, result);
    assert.deepEqual(api.calls.put, [], "nothing is written");
    assert.deepEqual(api.calls.post, []);
  }
});

test("only the app's explicit available: true opens it: any other answer reads as off", async () => {
  for (const answer of [
    { available: false },
    {},
    { available: "true" },
    { available: 1 },
    { enabled: true },
    null,
    [],
    [{ available: true }],
    "yes",
    true,
  ]) {
    const entry = tool("get_whatsapp_status", fakeApi({ status: SPRING_NEVER_CONNECTED }), fakeApp({ answer }));
    const result = await entry.handler({ projectId: PROJECT });
    assert.notEqual(result.isError, true, JSON.stringify(answer));
    assert.equal(result.structuredContent.available, false, `${JSON.stringify(answer)} is not a yes`);
    assert.equal(result.structuredContent.whatsapp, null);
    assert.equal(result.structuredContent.reason, `GET ${WHATSAPP_AVAILABILITY_PATH} → ${JSON.stringify(answer)}`);
    assertMatchesOutput(entry, result);
  }
  const extra = tool("get_whatsapp_status", fakeApi({ status: SPRING_NEVER_CONNECTED }), fakeApp({ answer: { available: true, since: "build" } }));
  const opened = await extra.handler({ projectId: PROJECT });
  assert.deepEqual(opened.structuredContent, { available: true, whatsapp: SPRING_NEVER_CONNECTED }, "a field the app adds later is no obstacle");
});

test("an app that fails any other way (an outage, a rate limit, a timeout, no network) is an error, never a closed channel and never a yes", async () => {
  const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
  for (const [failure, text] of [
    [new AppError(500, `GET ${WHATSAPP_AVAILABILITY_PATH} → 500: Internal Server Error`), `GET ${WHATSAPP_AVAILABILITY_PATH} → 500: Internal Server Error`],
    [new AppError(502, `GET ${WHATSAPP_AVAILABILITY_PATH} → 502: Bad Gateway`), `GET ${WHATSAPP_AVAILABILITY_PATH} → 502: Bad Gateway`],
    [new AppError(503, `GET ${WHATSAPP_AVAILABILITY_PATH} → 503: Service Unavailable`), `GET ${WHATSAPP_AVAILABILITY_PATH} → 503: Service Unavailable`],
    [new AppError(429, `GET ${WHATSAPP_AVAILABILITY_PATH} → 429: Too many requests`), `GET ${WHATSAPP_AVAILABILITY_PATH} → 429: Too many requests`],
    [new AppError(401, `GET ${WHATSAPP_AVAILABILITY_PATH} → 401: Unauthorized`), `GET ${WHATSAPP_AVAILABILITY_PATH} → 401: Unauthorized`],
    [new TypeError("fetch failed"), "Unexpected error: fetch failed"],
    [timeout, "Unexpected error: The operation was aborted due to timeout"],
  ]) {
    const api = fakeApi({ status: SPRING_STATUS });
    const result = await tool("get_whatsapp_status", api, fakeApp({ throws: failure })).handler({ projectId: PROJECT });
    assert.equal(result.isError, true, `${text} surfaces`);
    assert.equal(result.content[0].text, text, "the app's own words, the way Spring's failures read");
    assert.doesNotMatch(result.content[0].text, /not open on BranderUX|Say nothing about WhatsApp/);
    assert.equal(result.structuredContent, undefined, "no status, so nothing claims an answer");
  }
});

test("Spring answers first: a server with the channel off, without it, or failing is answered without asking the app", async () => {
  for (const [failure, expectError] of [
    [apiError("GET", STATUS_PATH, 503, WHATSAPP_NOT_CONFIGURED), false],
    [apiError("GET", STATUS_PATH, 404, "Not Found"), false],
    [apiError("GET", STATUS_PATH, 503, "Service Unavailable"), true],
    [apiError("GET", STATUS_PATH, 403, "refused"), true],
  ]) {
    const app = fakeApp({ answer: { available: false } });
    const result = await tool("get_whatsapp_status", fakeApi({ getThrows: failure }), app).handler({ projectId: PROJECT });
    assert.equal(result.isError === true, expectError, failure.message);
    assert.deepEqual(app.calls, [], `${failure.message}: the app is never asked`);
  }
});

test("the other two tools never ask the app: they act on a number step 8 already read as open", async () => {
  const app = fakeApp({ throws: new Error("the app was asked") });
  const forms = await tool("publish_whatsapp_forms", fakeApi({ published: SPRING_STATUS }), app).handler({ projectId: PROJECT });
  assert.notEqual(forms.isError, true);
  const titles = await tool("set_whatsapp_titles", fakeApi({ config: { policies: {} } }), app).handler({
    projectId: PROJECT,
    titles: [{ query: "show me the menu", title: "Menu" }],
  });
  assert.notEqual(titles.isError, true);
  assert.deepEqual(app.calls, []);
});

/**
 * Runs `run` with BOTH real clients (api-client.ts to Spring, app-client.ts to
 * the web app) over one stubbed fetch (no network) that answers by base:
 * `spring` and `app` are [status, text]. `calls` records each call's method
 * and URL, its Authorization header, its abort signal and its redirect mode.
 */
async function againstSpringAndApp({ spring, app }, run) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({
      call: `${init.method ?? "GET"} ${href}`,
      authorization: new Headers(init.headers).get("authorization"),
      signal: init.signal,
      redirect: init.redirect,
    });
    const answer = href.startsWith(`${APP_BASE}/`) ? app : href.startsWith(`${CONFIG.apiBase}/`) ? spring : null;
    assert.ok(answer, `no call leaves for anywhere else: ${href}`);
    const [status, text] = answer;
    return new Response(text, { status, headers: { "Content-Type": "application/json" } });
  };
  try {
    const token = async () => "api-audience-token";
    await run(createApiClient(token), createAppClient(token), calls);
  } finally {
    globalThis.fetch = original;
  }
}

test("through both real clients (no network): Spring's status with the caller's token, then the app's public switch with no credential", async () => {
  assert.equal(
    WHATSAPP_AVAILABILITY_PATH,
    "/api/whatsapp/availability",
    "the web app's route (BranderUX-client app/api/whatsapp/availability), answering {available: builderWhatsAppOn()}"
  );
  assert.notEqual(APP_BASE, CONFIG.apiBase, "two different services");
  const statusUrl = `GET ${CONFIG.apiBase}${STATUS_PATH}`;
  const switchUrl = `GET ${APP_BASE}${WHATSAPP_AVAILABILITY_PATH}`;
  const never = JSON.stringify(SPRING_NEVER_CONNECTED);

  await againstSpringAndApp({ spring: [200, never], app: [200, '{"available":false}'] }, async (api, app, calls) => {
    const entry = tool("get_whatsapp_status", api, app);
    const result = await entry.handler({ projectId: PROJECT });
    assert.deepEqual(result.structuredContent, {
      available: false,
      whatsapp: null,
      reason: `GET ${WHATSAPP_AVAILABILITY_PATH} → {"available":false}`,
    });
    assertMatchesOutput(entry, result);
    assert.deepEqual(
      calls.map((c) => c.call),
      [statusUrl, switchUrl]
    );
    assert.equal(calls[0].authorization, "Bearer api-audience-token", "Spring reads the owner's project with the token");
    assert.equal(calls[1].authorization, null, "the app's switch is public: no credential rides it");
    assert.ok(calls[1].signal instanceof AbortSignal, "and the read gives up rather than hang the tool");
    assert.equal(calls[1].redirect, "manual", "and never follows a redirect: only the route's own answer counts");
  });

  await againstSpringAndApp({ spring: [200, never], app: [200, '{"available":true}'] }, async (api, app, calls) => {
    const result = await tool("get_whatsapp_status", api, app).handler({ projectId: PROJECT });
    assert.deepEqual(result.structuredContent, { available: true, whatsapp: SPRING_NEVER_CONNECTED });
    assert.deepEqual(
      calls.map((c) => c.call),
      [statusUrl, switchUrl]
    );
  });

  await againstSpringAndApp({ spring: [200, never], app: [503, '{"error":"Service Unavailable"}'] }, async (api, app) => {
    const result = await tool("get_whatsapp_status", api, app).handler({ projectId: PROJECT });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, `GET ${WHATSAPP_AVAILABILITY_PATH} → 503: Service Unavailable`);
  });

  await againstSpringAndApp({ spring: [503, JSON.stringify(SPRING_CHANNEL_OFF)], app: [200, '{"available":true}'] }, async (api, app, calls) => {
    const result = await tool("get_whatsapp_status", api, app).handler({ projectId: PROJECT });
    assert.equal(result.structuredContent.available, false);
    assert.deepEqual(
      calls.map((c) => c.call),
      [statusUrl],
      "with the channel off on the server, the app is never asked"
    );
  });
});

/**
 * Runs `run` with both real clients while a real HTTP server on the loopback
 * interface plays the web app, reached through the REAL fetch: only APP_BASE is
 * swapped for the server's address, so whether a redirect is followed is
 * Node's own fetch at work, as in production. Spring answers from a stub as in
 * againstSpringAndApp (`spring` is [status, text]). `answer(path, origin)`
 * gives [status, headers, body] for each request the app receives; `hits`
 * records each one's path and any credential or cookie it carried; `origin`
 * is the live app's own.
 */
async function againstLiveApp({ spring, answer }, run) {
  const hits = [];
  const live = createServer((request, response) => {
    const { authorization = null, cookie = null } = request.headers;
    hits.push({ path: request.url, authorization, cookie });
    const [status, headers, body] = answer(request.url, `http://${request.headers.host}`);
    response.writeHead(status, headers);
    response.end(body);
  });
  await new Promise((resolve) => live.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${live.address().port}`;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith(`${APP_BASE}/`)) return original(`${origin}${href.slice(APP_BASE.length)}`, init);
    assert.ok(href.startsWith(`${CONFIG.apiBase}/`), `no call leaves for anywhere else: ${href}`);
    const [status, text] = spring;
    return new Response(text, { status, headers: { "Content-Type": "application/json" } });
  };
  try {
    const token = async () => "api-audience-token";
    await run(createApiClient(token), createAppClient(token), hits, origin);
  } finally {
    globalThis.fetch = original;
    live.closeAllConnections();
    await new Promise((resolve) => live.close(resolve));
  }
}

const HTML = { "Content-Type": "text/html; charset=utf-8" };
const JSON_BODY = { "Content-Type": "application/json" };
const SIGN_IN_PAGE = "<!DOCTYPE html><html><head><title>Sign in</title></head><body>Sign in</body></html>";
const NOT_FOUND_PAGE = "<!DOCTYPE html><html><head><title>404: This page could not be found.</title></head></html>";

/**
 * An app from before WhatsApp as it answers (BranderUX-client fa16193b): its
 * middleware does not list the switch's path as public, so a request with no
 * session cookie gets a 307 with no body to the sign-in page (signInOf, on the
 * app's own origin), and the sign-in page, a public route, is a 200 HTML
 * page. Any other path is Next's 404 page.
 */
function appBeforeWhatsApp(path, origin) {
  if (path === WHATSAPP_AVAILABILITY_PATH) return [307, { Location: signInOf(origin) }, ""];
  if (path.startsWith("/auth/signin?")) return [200, HTML, SIGN_IN_PAGE];
  return [404, HTML, NOT_FOUND_PAGE];
}

test("against an app from before WhatsApp, through the real fetch: available: false, and its sign-in page is never fetched", async () => {
  // Followed, the redirect reaches the sign-in page, a 200 HTML page JSON.parse
  // cannot read, and the status would fail at the end of every hosted build
  // instead of saying nothing about WhatsApp.
  for (const status of [SPRING_NEVER_CONNECTED, SPRING_STATUS]) {
    const spring = [200, JSON.stringify(status)];
    await againstLiveApp({ spring, answer: appBeforeWhatsApp }, async (api, app, hits, origin) => {
      const entry = tool("get_whatsapp_status", api, app);
      const result = await entry.handler({ projectId: PROJECT });
      assert.notEqual(result.isError, true, result.content[0].text);
      assert.deepEqual(result.structuredContent, {
        available: false,
        whatsapp: null,
        reason: `GET ${WHATSAPP_AVAILABILITY_PATH} → 307: redirect to ${signInOf(origin)}`,
      });
      assert.match(result.content[0].text, /no WhatsApp here to offer or look after/);
      assert.match(result.content[0].text, /Say nothing about WhatsApp to the owner/);
      assertMatchesOutput(entry, result);
      assert.deepEqual(
        hits,
        [{ path: WHATSAPP_AVAILABILITY_PATH, authorization: null, cookie: null }],
        "one request: the redirect is never followed, and no credential rides it"
      );
    });
  }
});

test("against a live app, through the real fetch: the route's own JSON decides, a 404 or a page that is not JSON is no switch, an outage stays an error", async () => {
  const path = WHATSAPP_AVAILABILITY_PATH;
  const spring = [200, JSON.stringify(SPRING_NEVER_CONNECTED)];
  for (const [answer, expected] of [
    [[200, JSON_BODY, '{"available":true}'], { available: true, whatsapp: SPRING_NEVER_CONNECTED }],
    [[200, JSON_BODY, '{"available":false}'], { available: false, whatsapp: null, reason: `GET ${path} → {"available":false}` }],
    // An app that lets /api/whatsapp through, without this route: Next's 404 page.
    [[404, HTML, NOT_FOUND_PAGE], { available: false, whatsapp: null, reason: `GET ${path} → 404: ${NOT_FOUND_PAGE}` }],
    // A page served in the route's place.
    [[200, HTML, SIGN_IN_PAGE], { available: false, whatsapp: null, reason: `GET ${path} → 200: not JSON: ${SIGN_IN_PAGE}` }],
  ]) {
    await againstLiveApp({ spring, answer: () => answer }, async (api, app, hits) => {
      const entry = tool("get_whatsapp_status", api, app);
      const result = await entry.handler({ projectId: PROJECT });
      assert.notEqual(result.isError, true, result.content[0].text);
      assert.deepEqual(result.structuredContent, expected);
      assertMatchesOutput(entry, result);
      assert.equal(hits.length, 1);
    });
  }
  const outage = () => [503, JSON_BODY, '{"error":"Service Unavailable"}'];
  await againstLiveApp({ spring, answer: outage }, async (api, app) => {
    const result = await tool("get_whatsapp_status", api, app).handler({ projectId: PROJECT });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, `GET ${path} → 503: Service Unavailable`);
  });
});

test("the app client's refactor keeps the verification POST as it was: the caller's token, a JSON body, the same error wording", async () => {
  await againstSpringAndApp({ spring: [500, ""], app: [404, '{"error":"Not Found"}'] }, async (_api, app, calls) => {
    await assert.rejects(app.post("/api/agent/canned-screens/verify", { projectId: PROJECT }), (error) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.status, 404);
      assert.equal(error.message, "POST /api/agent/canned-screens/verify → 404: Not Found");
      return true;
    });
    assert.deepEqual(
      calls.map((c) => c.call),
      [`POST ${APP_BASE}/api/agent/canned-screens/verify`]
    );
    assert.equal(calls[0].authorization, "Bearer api-audience-token");
    assert.equal(calls[0].redirect, undefined, "it follows redirects, fetch's default, as it always did");
  });
  // Only the public read turns a 2xx page into AppNotJsonError: the POST still
  // throws what JSON.parse throws, which verification reports in its own words.
  await againstSpringAndApp({ spring: [500, ""], app: [200, "<!DOCTYPE html>"] }, async (_api, app) => {
    await assert.rejects(app.post("/api/agent/canned-screens/verify", { projectId: PROJECT }), (error) => {
      assert.ok(error instanceof SyntaxError);
      assert.equal(error instanceof AppError, false);
      return true;
    });
  });
});

// --- publish_whatsapp_forms ------------------------------------------------------

/**
 * Spring's reply to a forms run (branderux-server WhatsAppController.publishFlows):
 * entity names per outcome, the failures with their reasons, whether Meta
 * refused the token, and the channel's status after the run.
 */
const SPRING_PUBLISHED = {
  published: ["bookings"],
  unchanged: ["orders"],
  removed: [],
  failed: [],
  reconnectRequired: false,
  channel: SPRING_STATUS,
};

/** The same run when Meta refused the token part way: the rest skipped, the channel waiting on the owner. */
const SPRING_PUBLISH_REFUSED = {
  published: [],
  unchanged: [],
  removed: [],
  failed: [{ entity: "bookings", reason: "needs_reconnect" }],
  reconnectRequired: true,
  channel: { ...SPRING_STATUS, status: "needs_reconnect" },
};

test("the forms republish is POST /projects/{id}/whatsapp/flows/publish, and Spring's reply passes through whole", async () => {
  for (const published of [SPRING_PUBLISHED, SPRING_PUBLISH_REFUSED]) {
    const api = fakeApi({ published });
    const entry = tool("publish_whatsapp_forms", api);
    const result = await entry.handler({ projectId: PROJECT });
    assert.notEqual(result.isError, true);
    assert.deepEqual(api.calls.post, [{ path: PUBLISH_PATH, body: {} }]);
    assert.deepEqual(result.structuredContent, { forms: published });
    assert.deepEqual(JSON.parse(result.content[0].text), { forms: published }, "the model reads the same reply");
    assertMatchesOutput(entry, result);
  }
});

test("any reply shape stays inside the declared output (204, a list)", async () => {
  for (const [reply, forms] of [
    [null, {}],
    [[{ entity: "bookings" }], { result: [{ entity: "bookings" }] }],
  ]) {
    const entry = tool("publish_whatsapp_forms", fakeApi({ published: reply }));
    const result = await entry.handler({ projectId: PROJECT });
    assert.deepEqual(result.structuredContent, { forms });
    assertMatchesOutput(entry, result);
  }
});

test("a republish where the channel is switched off says so, as an error the model can relay", async () => {
  const api = fakeApi({ postThrows: apiError("POST", PUBLISH_PATH, 503, WHATSAPP_NOT_CONFIGURED) });
  const result = await tool("publish_whatsapp_forms", api).handler({ projectId: PROJECT });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /not open on BranderUX yet/);
});

/**
 * Spring's body for a forms run on a number that does not answer: already
 * waiting for the owner, or holding a token the server cannot use, which the
 * run marks (branderux-server GlobalExceptionHandler.whatsAppRefusal for
 * WhatsAppChannelException.Reason.NEEDS_RECONNECT).
 */
const SPRING_NEEDS_RECONNECT = {
  timestamp: "2026-09-25T09:30:00.123456",
  status: 409,
  error: "whatsapp_needs_reconnect",
  code: "whatsapp_needs_reconnect",
  message: "The WhatsApp connection needs to be renewed",
  retryable: false,
};

test("Spring's own 409 whatsapp_needs_reconnect, through the real API client, answers reconnectRequired: true", async () => {
  assert.equal(WHATSAPP_NEEDS_RECONNECT, "whatsapp_needs_reconnect", "WhatsAppChannelException.Reason.NEEDS_RECONNECT");
  await againstSpring(409, JSON.stringify(SPRING_NEEDS_RECONNECT), async (api, calls) => {
    const entry = tool("publish_whatsapp_forms", api);
    const result = await entry.handler({ projectId: PROJECT });
    assert.notEqual(result.isError, true, "a number waiting for the owner is a fact step 8 acts on");
    assert.deepEqual(result.structuredContent, {
      forms: { reconnectRequired: true, reason: `POST ${PUBLISH_PATH} → 409: whatsapp_needs_reconnect` },
    });
    assertMatchesOutput(entry, result);
    const text = result.content[0].text;
    assert.match(text, /this WhatsApp number is waiting for the owner \(reconnectRequired: true\), so WhatsApp is not answering/);
    assert.match(text, /Say that instead of saying the number answers/);
    assert.match(text, /the WhatsApp row of the Agent tab shows what it needs; never promise that connecting again fixes it\./);
    assert.equal(text.includes("—"), false);
    assert.doesNotMatch(text, MONEY);
    assert.deepEqual(calls, [`POST ${CONFIG.apiBase}${PUBLISH_PATH}`]);
  });
});

test("any other 409 on the forms run (another code, a proxy's text) stays an error", async () => {
  for (const detail of ["connect_conflict", "Conflict"]) {
    const api = fakeApi({ postThrows: apiError("POST", PUBLISH_PATH, 409, detail) });
    const result = await tool("publish_whatsapp_forms", api).handler({ projectId: PROJECT });
    assert.equal(result.isError, true, `${detail} surfaces`);
    assert.equal(result.content[0].text, `POST ${PUBLISH_PATH} → 409: ${detail}`);
  }
  const status = fakeApi({ getThrows: apiError("GET", STATUS_PATH, 409, WHATSAPP_NEEDS_RECONNECT) });
  const read = await tool("get_whatsapp_status", status).handler({ projectId: PROJECT });
  assert.equal(read.isError, true, "the status read has no such answer: the server reports needs_reconnect in its body");
});

test("a republish that fails any other way (an outage's 503, a 404) surfaces that failure, never as a closed channel", async () => {
  for (const [status, detail] of [
    [503, "upstream connect error or disconnect/reset before headers"],
    [404, "Not Found"],
  ]) {
    const api = fakeApi({ postThrows: apiError("POST", PUBLISH_PATH, status, detail) });
    const result = await tool("publish_whatsapp_forms", api).handler({ projectId: PROJECT });
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, `POST ${PUBLISH_PATH} → ${status}: ${detail}`);
  }
});

// --- what the tools say ----------------------------------------------------------

test("every WhatsApp tool says who connects, never to ask for a number or a token TO CONNECT it, that the handoff number still is, and what a connect needs", () => {
  for (const name of TOOL_NAMES) {
    const { description, title } = tool(name).config;
    assert.ok(title, `${name} has a title`);
    assert.match(description, /The owner connects WhatsApp themselves/);
    assert.match(description, /the WhatsApp row of the Agent tab, or the in-app Builder's connect card, opens Meta's own sign-in window/);
    assert.match(description, /To connect it, never ask for a phone number, a code or a token;/);
    assert.doesNotMatch(description, /Never ask for a phone number/, `${name}: no never-ask that is not about connecting`);
    assert.match(
      description,
      /a WhatsApp handoff number or link is still asked, confirmed and stored in policies\.handoff\.whatsapp, whatever the status\./,
      `${name}: the handoff number is asked for whatever the channel's status`
    );
    assert.equal(description.includes("—"), false, `${name} carries an em dash`);
    assert.doesNotMatch(description, MONEY, `${name} names money`);
  }
  // What a connect needs: the forms and the titles say it outright; the
  // status says it through blockedReason's own values, which already name
  // both (its 2,048-character window has no room to say it twice).
  for (const name of ["publish_whatsapp_forms", "set_whatsapp_titles"]) {
    assert.match(
      tool(name).config.description,
      /WhatsApp needs a published agent \(publish_site\) and a site that does not require sign-in\./
    );
  }
  assert.match(
    tool("get_whatsapp_status").config.description,
    /blockedReason \(not_published: publish the site first; login_required_site: WhatsApp is not available yet for a site that requires sign-in; null: nothing blocks it\): it stops a connect/
  );
});

test("each description says what its own tool is for", () => {
  const describe = (name) => tool(name).config.description;
  const status = describe("get_whatsapp_status");
  assert.match(status, /available: false means there is no WhatsApp here to offer/);
  assert.match(status, /say nothing about it to the owner/);
  assert.match(
    status,
    /status \(null before any connect; connecting: a connect under way, not answering yet; active: it answers; needs_reconnect: a breakage, it does not answer and the Agent tab's WhatsApp row shows what it needs; disconnected: the owner ended it on purpose, so say nothing about WhatsApp unless they ask and never offer it again\)/
  );
  assert.match(
    status,
    /Call it last in a hosted build, after the wrap-up, to decide what to say about WhatsApp, if anything; say each not-answering sentence and the offer at most once per conversation\./
  );
  assert.doesNotMatch(
    status,
    /until the owner connects it again/,
    "a reconnect does not lift a ban Meta put on the account, nor a block"
  );
  assert.match(status, /not_published: publish the site first/);
  assert.match(status, /login_required_site: WhatsApp is not available yet for a site that requires sign-in/);
  assert.match(status, /on a connected number it stops the answers until it is lifted/);
  assert.match(status, /brander:\/\/docs\/whatsapp-channel/);

  const forms = describe("publish_whatsapp_forms");
  assert.match(
    forms,
    /every entity visitors can add to \(writePolicy open, its create_<entity> tool not switched off\) becomes one native WhatsApp form/
  );
  assert.match(forms, /the older versions are retired, so a form a customer received before the republish no longer opens/);
  assert.match(forms, /Connecting WhatsApp publishes the forms by itself/);
  assert.match(forms, /after you change a writable entity \(define_entity\), or when such an entity is missing from its flows/);
  assert.match(
    forms,
    /The reply names the entities published, unchanged, removed and failed \(\{entity, reason\}: a failed one keeps its older form, if it had one\), then reconnectRequired and channel, the status after the run: reconnectRequired true or a channel\.status other than active means WhatsApp is not answering, so say that instead of saying the number answers\./
  );
  assert.match(forms, /A number already waiting for the owner runs nothing and answers reconnectRequired true alone\./);
  for (const key of Object.keys(SPRING_PUBLISHED)) {
    assert.match(forms, new RegExp(`\\b${key}\\b`), `the forms description names the reply's ${key}`);
  }

  const titles = describe("set_whatsapp_titles");
  assert.match(titles, /a row title stops at 24 characters/);
  assert.match(titles, /keyed by the chip's query exactly as it is stored/);
  assert.match(titles, /MERGE into policies\.whatsappTitles/);
  assert.match(titles, /at most 50 per call, and a title of null removes that query's title/);
  assert.match(titles, /send the whole current set with replace: true instead, so the titles of chips that are gone go too/);
  assert.match(titles, /\(an empty list clears them all\); a call that changes nothing writes nothing/);
  assert.match(titles, /At most 50 titles are kept, and the policy bag must stay within the server's 8 KB/);
  assert.match(titles, /never through upsert_agent_config/);
});

test("each WhatsApp tool's description fits the 2,048-character window the server instructions keep", () => {
  // INSTRUCTIONS_WINDOW is where Claude Code cuts server instructions. Inside
  // it, a client that cuts a tool description at the same length loses
  // nothing: the end of get_whatsapp_status says when to call it and when to
  // read the channel doc (only for an offer or upkeep, never before the call).
  for (const name of TOOL_NAMES) {
    const { description } = tool(name).config;
    assert.ok(description.length <= INSTRUCTIONS_WINDOW, `${name}: ${description.length} characters`);
  }
});

test("pauseHours is the owner's four choices, and 16 reads exactly as the server resolves it, not as a flat 16 hours", () => {
  // branderux-server WhatsAppThreadService.pauseUntil: "until tomorrow morning"
  // ends at the first 08:00 on the business's clock (policies.timezone; UTC when
  // it is missing or Java knows no such zone, AgentPolicies.timezone) at least
  // four hours after the owner's reply, so a reply at 02:00 ends that same
  // morning and one at 05:00 the next day's. "08:00 the next morning" was wrong
  // for the first, and "08:00, and at least four hours after the reply" alone
  // could read as whichever of the two comes later. A reply at 16:00 does pause
  // for exactly 16 hours, so the doc says "not a flat 16 hours", never "never".
  const status = tool("get_whatsapp_status").config.description;
  assert.match(
    status,
    /pauseHours \(how long the agent stays quiet in a chat after the owner replies: 1, 4 or 24 hours, or 16, "until tomorrow morning": until the first 08:00 in the business's time zone that is at least four hours after the reply\)/
  );
  const text = flat(channelDoc);
  assert.match(
    text,
    /1, 4 and 24 are hours; 16 is the owner's "until tomorrow morning": until the first 08:00 in the business's time zone \(`policies\.timezone`; UTC when it is missing or not a valid time zone\) that is at least four hours after the reply\. A reply between midnight and 04:00 pauses the chat until 08:00 that same morning, a later one until 08:00 the next day; not a flat 16 hours\./
  );
  for (const [surface, words] of [
    ["the status description", status],
    ["the channel doc", text],
  ]) {
    assert.doesNotMatch(words, /08:00 the next morning/, `${surface}: not every pause ends the next morning`);
    assert.doesNotMatch(words, /never 16 hours/, `${surface}: a reply at 16:00 pauses exactly 16 hours`);
  }
});

/** The doc's field list for the status: from its lead-in up to the handoff paragraph that follows it. */
function statusFields() {
  const start = channelDoc.indexOf("Otherwise `whatsapp` is the channel as the server reports it:");
  assert.notEqual(start, -1);
  const end = channelDoc.indexOf("`policies.handoff.whatsapp`", start);
  assert.ok(end > start, "the handoff paragraph follows the field list");
  return channelDoc.slice(start, end);
}

test("the status is described field for field as Spring's status body carries it, every value of its enums named", () => {
  const status = tool("get_whatsapp_status").config.description;
  const fields = flat(statusFields());
  for (const key of Object.keys(SPRING_STATUS)) {
    assert.match(status, new RegExp(`\\b${key}\\b`), `the status description names ${key}`);
    assert.match(fields, new RegExp(`\`${key}\``), `the doc's field list names ${key}`);
  }
  for (const value of ["connecting", "active", "needs_reconnect", "disconnected", "not_published", "login_required_site"]) {
    assert.match(status, new RegExp(`\\b${value}\\b`), `the status description names ${value}`);
    assert.match(fields, new RegExp(`\`${value}\``), `the doc's field list names ${value}`);
  }
  // The send block's reasons are worded in the doc alone: the description's
  // 2,048-character window leaves it a pointer there (the next test).
  for (const value of SEND_BLOCK_REASONS) {
    assert.match(fields, new RegExp(`\`${value}\``), `the doc's field list names ${value}`);
  }
  assert.match(status, /tier and messagingLimit \(the same value: Meta's messaging limit\)/);
  assert.match(fields, /`tier` and `messagingLimit`: one value under two names, Meta's messaging limit for the number/);
  assert.match(
    status,
    /connected \(true from the owner's connect until the number is disconnected; status, blockedReason and sendBlockedReason say whether it answers\)/
  );
  assert.match(fields, /`connected`: true from the owner's connect until the number is disconnected, so a number still connecting or waiting for a reconnect counts too: `status`, `blockedReason` and `sendBlockedReason` say whether it answers\./);
  assert.match(fields, /`blockedReason`: why WhatsApp cannot serve the project right now, `not_published` or `login_required_site` \(above\); null when nothing blocks it/);
});

test("the send block: the doc words each reason and when it clears; the status description names both fields and points at the doc", () => {
  const status = tool("get_whatsapp_status").config.description;
  assert.match(status, /status, blockedReason and sendBlockedReason say whether it answers/);
  assert.match(status, /and sendBlockedReason with sendBlockedAt \(Meta refusing to send: see the doc\)\./);
  assert.match(status, /Read brander:\/\/docs\/whatsapp-channel only to offer or maintain it\.$/, "the doc it points at");

  const fields = flat(statusFields());
  // blockedReason stays the project's own block (Spring: the connect gate);
  // Meta's refusal is a field of its own.
  assert.match(fields, /It only ever names the project's own block: Meta refusing to send is `sendBlockedReason`\./);
  const at = fields.indexOf("- `sendBlockedReason`:");
  assert.notEqual(at, -1);
  const block = fields.slice(at, fields.indexOf("- `sendBlockedAt`:", at));
  assert.match(
    block,
    /why Meta refuses to send anything from the connected number, so WhatsApp is not answering even with `status` `active` \(customers' messages go unanswered\); null while Meta sends, and always null once no number is connected\./
  );
  assert.match(block, /It clears the first time Meta accepts a reply again, which takes a customer writing after the cause is gone, so it can still show for a while after the owner fixed it\./);
  assert.match(block, /never promise that it fixes a send block/);
  assert.match(block, /- `payment_required`: a problem with the payment method on the business's WhatsApp account with Meta; it answers again once the owner adds or fixes that payment method in Meta/);
  assert.match(block, /- `account_restricted`: Meta restricted the account or the number \(a policy violation, a limit on the number after its messages were flagged as spam, or a display name Meta has not approved yet\); it answers again once Meta lifts that/);
  assert.match(block, /- `not_registered`: Meta says the number is not registered for sending; it answers again once the number is registered with Meta again\./);
  assert.match(fields, /- `sendBlockedAt`: when Meta last refused \(for the record\); null with `sendBlockedReason`\./);

  // The worker's route reads the same block as meta_payment_required and so
  // on; the owner status the tool returns never carries those values.
  for (const [surface, words] of [
    ["the status description", status],
    ["the channel doc", channelDoc],
    ["step 8", arcStep8Raw()],
  ]) {
    assert.doesNotMatch(words, /\bmeta_(payment_required|account_restricted|not_registered)\b/, `${surface}: no route-only value`);
  }
});

// --- the channel doc ---------------------------------------------------------------

test("the channel doc is served by read_doc", () => {
  const docs = loadDocs();
  assert.ok(docs.has("whatsapp-channel"), "the build copies it with the rest of the corpus");
  assert.equal(docs.get("whatsapp-channel"), channelDoc);
  assert.match(channelDoc, /^# WhatsApp channel: /);
});

test("the doc: what the channel is, and what it needs, for as long as it is connected", () => {
  const text = flat(channelDoc);
  assert.match(text, /the SAME agent answers there/);
  assert.match(text, /takes over any chat simply by replying/);
  assert.match(text, /only after `publish_site`/);
  assert.match(text, /`not_published`/);
  assert.match(text, /`login_required_site`/);
  assert.match(text, /The OWNER connects, never you/);
  assert.match(text, /To connect it, never ask for the phone number, a code, a token or a password/);
  assert.match(text, /a site unpublished later, or switched to required sign-in, stops the WhatsApp answers too/);
  assert.match(text, /Until it is lifted the number cannot be connected again either\./);
  assert.match(
    text,
    /`needs_reconnect` \(a breakage: Meta stopped accepting the connection, or paused the account\) and `disconnected` \(ended on purpose: the owner disconnected it in the Agent tab or in Meta's own settings\) do not answer\. A `disconnected` number answers again once the owner connects it from the WhatsApp row of the Agent tab\./
  );
  assert.doesNotMatch(text, /the owner or Meta ended it/, "a disconnect is the owner's own act, in the Agent tab or in Meta's settings");
  assert.match(
    text,
    /A `needs_reconnect` one may need that too, or may be waiting on Meta \(an account Meta offboarded or disabled comes back when Meta restores it, and connecting again does not lift a ban\), so never promise that connecting again fixes it\./
  );
  assert.match(text, /`policies\.handoff\.whatsapp` is a different thing/);
});

test("coexistence decides where a person answers: the doc and the status description never promise one in a chat nobody from the business can write in", () => {
  // The server's route carries the channel's coexistence to the worker, and
  // everything that says where a person is follows it (branderux-server
  // whatsapp-channel.md, "Rules for changes"): on a number without the
  // WhatsApp Business app nobody from the business writes in the chat, the
  // agent asks how the business can reach the customer, and the owner's email
  // points at the Agent tab's Conversations.
  const text = flat(channelDoc);
  assert.match(text, /Who else can answer depends on the number \(`coexistence`, below\)\./);
  assert.match(
    text,
    /On a number connected without the app, nobody from the business can write in its chats: only the agent answers there\./
  );
  assert.match(
    text,
    /- `coexistence`: whether a person from the business can answer in the chats, which decides what you tell the owner about a person answering\./
  );
  assert.match(text, /False: the number runs without the app, so nobody from the business can write in its chats/);
  assert.doesNotMatch(text, /`coexistence`[^.]*for the record/, "coexistence is not for the record: it decides who answers");
  assert.match(text, /- `connectedAt` and `smbSyncRequestedAt`: for the record, nothing to act on\./);
  assert.match(text, /It matters only where the owner can reply in a chat, a number with `coexistence` true\./);

  const start = channelDoc.indexOf("## What the customer gets");
  assert.notEqual(start, -1);
  const bullets = bulletsOf(channelDoc.slice(start, channelDoc.indexOf("\n## ", start + 1)), "");
  const inChat = caseOf(bullets, "- Asking for a person, on a number with `coexistence` true");
  assert.match(inChat, /the agent says a person from the business will answer in this chat/);
  assert.match(
    inChat,
    /answers the customer in that chat, in the WhatsApp Business app \(or at the phone number or email they gave, when they asked to be reached another way\)\./
  );
  const outside = caseOf(bullets, "- Asking for a person, on a number with `coexistence` false");
  assert.match(outside, /nobody from the business writes in the chat/);
  assert.match(outside, /the agent asks how the business can reach the customer \(a phone number or an email\)/);
  assert.match(outside, /when they give none, only that it was sent/);
  assert.match(outside, /the owner reads the conversation in the Agent tab, under Conversations/);
  assert.doesNotMatch(outside, /answer in this chat|WhatsApp Business app/, "no person, and no app, for a number without one");
  assert.doesNotMatch(text, /someone will answer in this chat/, "every promise of a person names its number");

  const status = tool("get_whatsapp_status").config.description;
  assert.match(status, /coexistence \(see the doc\)/);
  assert.doesNotMatch(status, /coexistence, connectedAt and smbSyncRequestedAt \(for the record\)/);
});

test("the doc: WhatsApp's limits, the forms, and a visual answer as an Open link (its image only where screen images are on)", () => {
  const text = flat(channelDoc);
  assert.match(text, /reply buttons: at most 3, each title at most 20 characters/);
  assert.match(text, /a list: at most 10 rows, each row title at most 24 characters/);
  assert.match(text, /a carousel of 2 to 10 cards built from live rows/);
  assert.match(
    text,
    /arrives as a short summary with an \*\*Open\*\* button: a link to the full branded screen on the site \(with an image of it where screen images are on\)/
  );
  assert.doesNotMatch(text, /arrives as an image of the business's branded screen/, "the image is not the default");
  assert.match(
    text,
    /Every entity visitors can add to \(writePolicy `open`, its `create_<entity>` tool not switched off\) becomes one WhatsApp form/
  );
  assert.match(text, /a consent tick for `marketingConsent`/);
  assert.match(text, /the FIELD TITLES rule/);
  assert.match(text, /or when such an entity is missing from `flows`/);
  assert.match(text, /A republish retires the older versions, so a form a customer received before it no longer opens/);
  assert.match(
    text,
    /Its reply names the entities `published`, `unchanged`, `removed` and `failed` \(`\{entity, reason\}`: a failed one keeps its older form, if it had one\), then `reconnectRequired` and `channel`, the status after the run: `reconnectRequired: true` or a `channel\.status` other than `active` means WhatsApp is not answering\./
  );
  assert.match(text, /A number already waiting for the owner runs nothing and answers `reconnectRequired: true` alone\./);
  assert.match(text, /\*\*Confirm\*\* \/ \*\*Cancel\*\*/);
});

test("the doc: the titles, keyed by the chip's exact query, merged, removable, replaceable and bounded", () => {
  const text = flat(channelDoc);
  assert.match(text, /`set_whatsapp_titles`/);
  assert.match(text, /a row title stops at 24 characters/);
  assert.match(text, /keyed by the chip's query, character for character/);
  assert.match(text, /The row still sends the chip's full query/);
  assert.match(text, /Titles merge into `policies\.whatsappTitles`/);
  assert.match(text, /at most 50 per call, and a title of `null` removes that query's title/);
  assert.match(
    text,
    /send the home's whole current set with `replace: true` \(an empty list when no label runs past 24 characters\), so the titles of chips that are gone go too; a call that changes nothing writes nothing/
  );
  assert.match(text, /At most 50 titles are kept, and the whole policy bag must stay within the server's 8 KB/);
});

/** The channel doc's "Offering it" section (the doc's copy of step 8), raw. */
function offeringRaw() {
  const start = channelDoc.indexOf("## Offering it: the last step of a hosted build");
  assert.notEqual(start, -1);
  return channelDoc.slice(start, channelDoc.indexOf("\n## ", start + 1));
}

test("the doc: step 8 reads the channel's health first, offers only where customers use WhatsApp, and never pushes", () => {
  const section = flat(offeringRaw());
  assert.match(section, /hosted-agent-contract, THE HOSTED BUILD ARC, step 8/);
  assert.match(section, /act on the first case that fits/);
  const cases = [
    "- `available: false`: WhatsApp is not open here. Say nothing about it.",
    "- `status` `connecting`: the owner's connect has not finished. Say nothing about WhatsApp unless the owner asks.",
    "- a `blockedReason` on a connected number (`status` `active` or `needs_reconnect`): say in one plain sentence that WhatsApp is not answering until the block is lifted (the site published again; sign-in no longer required), and that until then it cannot be connected again either. Say it at most once in this conversation. Nothing to offer.",
    "- `status` `needs_reconnect`, a breakage: say in one plain sentence that their WhatsApp is not answering (Meta stopped accepting the connection or paused the account), and that the WhatsApp row of the Agent tab shows what it needs. Never promise that connecting again fixes it. Say it at most once in this conversation. Nothing to offer.",
    "- `status` `disconnected`: the number was disconnected on purpose (in the Agent tab, or in Meta's own settings). That is the owner's choice, not a breakage: say nothing about WhatsApp unless the owner asks. Asked, say in one plain sentence that it is disconnected and that the WhatsApp row of the Agent tab connects it again (with a `blockedReason`, why it cannot be connected yet instead). Never offer it again yourself.",
    "- `connected: true`: write the short titles (above) as the home's whole current set with `replace: true`, call `publish_whatsapp_forms` if this build changed a writable entity or an `open` entity whose create tool is not switched off is missing from `flows`, and say their WhatsApp number answers too; when that run answers `reconnectRequired: true` or a `channel.status` other than `active`, it is not answering: say so as in the `needs_reconnect` case instead.",
    "- a `blockedReason` on a project that is not connected: say nothing unless the owner asks",
    "- not connected yet: OFFER it once in this conversation, in one plain sentence, when the business's customers reach it on WhatsApp",
  ];
  let previous = -1;
  for (const item of cases) {
    const at = section.indexOf(item);
    assert.ok(at > previous, `in order: ${item}`);
    previous = at;
  }
  // A blocked or banned number is never promised a reconnect; only a number
  // the owner disconnected is pointed back at the Agent tab, and only when
  // nothing blocks it.
  const bullets = bulletsOf(offeringRaw(), "");
  for (const prefix of ["- a `blockedReason` on a connected number", "- `status` `needs_reconnect`"]) {
    assert.doesNotMatch(caseOf(bullets, prefix), /connects it again/, `${prefix}: no reconnect promised`);
  }
  assert.match(
    caseOf(bullets, "- `status` `disconnected`"),
    /connects it again \(with a `blockedReason`, why it cannot be connected yet instead\)/
  );
  // A number Meta refuses to send from is still `active`: the connected case
  // does its upkeep and never says it answers.
  assert.match(
    caseOf(bullets, "- `connected: true`"),
    /say so as in the `needs_reconnect` case instead\. Otherwise, with a `sendBlockedReason` \(in the status, or in that run's `channel`\), Meta refuses every reply from the number: instead of saying it answers, say in one plain sentence that it is not answering and why, in plain words for that reason \(`sendBlockedReason`, above\), with no price or amount, and never promise that connecting again fixes it\. Say it at most once in this conversation\./
  );
  assert.match(section, /when `get_whatsapp_status` is not among your tools/);
  assert.match(section, /It is an offer the owner may decline, never a push/);
  assert.match(section, /On a yes, write the short titles \(so the list is ready on the first day\)/);
  assert.match(
    section,
    /A no, or any reply that is not a yes, closes the offer: never raise WhatsApp again in this conversation unless the owner does\./
  );
  assert.match(section, /With no sign that its customers use WhatsApp, say nothing about it/);
});

test("the doc: what the owner is told before connecting, in Meta's own terms and with no price or amount", () => {
  const text = flat(channelDoc);
  assert.match(text, /existing broadcast lists become read-only/);
  assert.match(text, /disappearing messages, view-once and live location are turned off/);
  assert.match(
    text,
    /linked devices are unlinked when the number connects and have to be linked again, and WhatsApp for Windows and WearOS are not supported/
  );
  assert.match(text, /uninstalling it disconnects the number/);
  assert.match(text, /open the WhatsApp Business app at least every two weeks/);
  assert.doesNotMatch(text, /13 days/, "Meta's own figure, not a reseller's");
  assert.match(text, /greeting and away messages should be turned off, or customers get two replies/);
  assert.match(text, /4 hours by default, or 1 hour, until tomorrow morning or 24 hours/);
  assert.match(text, /Meta may charge the business directly for replies above its monthly free allowance/);
  assert.match(text, /never a price, an amount, a rate or a currency/);
  assert.match(text, /Never promise messages the business sends first/);
  assert.doesNotMatch(channelDoc, MONEY);
});

test("the doc carries no em dash (people read what it makes the model say)", () => {
  assert.equal(channelDoc.includes("—"), false);
});

// --- the arc: step 8, the build order, the policy bag --------------------------------

/** Step 8 of THE HOSTED BUILD ARC, raw, up to the blank line that ends the arc. */
function arcStep8Raw() {
  const wrapUp = hosted.indexOf("**WRAP-UP");
  const seven = hosted.indexOf("\n7. **", wrapUp);
  const eight = hosted.indexOf("\n8. **", seven);
  const questions = hosted.indexOf("## The five questions");
  assert.ok(wrapUp !== -1 && seven > wrapUp, "the arc has its WRAP-UP and the widget step");
  assert.ok(eight > seven, "step 8 comes after the widget step");
  assert.ok(questions > eight, "and still inside the arc");
  const end = hosted.indexOf("\n\n", eight + 1);
  assert.ok(end !== -1 && end < questions, "the arc ends with step 8");
  return hosted.slice(eight + 1, end);
}

/** Step 8, flattened. */
const arcStep8 = () => flat(arcStep8Raw());

test("the arc gains step 8, the WhatsApp offer, right after the widget step and last", () => {
  const step = arcStep8();
  assert.match(step, /^8\. \*\*WhatsApp offer, last\.\*\*/);
  assert.doesNotMatch(step, /\b9\. /, "no step follows it");
  assert.match(step, /Call `get_whatsapp_status` and act on the first case that fits/);
  assert.match(step, /\(if `get_whatsapp_status` is not among your tools, say nothing about WhatsApp\)/);
  assert.equal(step.includes("—"), false, "step 8 carries an em dash");
  assert.doesNotMatch(step, MONEY);
});

test("step 8 reads a connected number's health first, then offers only where the customers use WhatsApp", () => {
  const step = arcStep8();
  const cases = [
    "- `available: false`: say nothing about WhatsApp unless the owner asks.",
    "- `status` `connecting`: the owner's connect has not finished; say nothing about WhatsApp unless the owner asks.",
    "- a `blockedReason` on a connected number (`status` `active` or `needs_reconnect`): tell them in one plain sentence that WhatsApp is not answering, and cannot be connected again, until the site is published again (`not_published`) or no longer requires sign-in (`login_required_site`); say it at most once in this conversation.",
    "- `status` `needs_reconnect`, a breakage: tell the owner in one plain sentence that WhatsApp is not answering (Meta stopped accepting the connection or paused the account), and that the WhatsApp row of the Agent tab shows what it needs; never promise that connecting again fixes it; say it at most once in this conversation.",
    "- `status` `disconnected`: the number was disconnected on purpose (in the Agent tab, or in Meta's own settings), the owner's choice and not a breakage, so say nothing about WhatsApp unless the owner asks; asked, say in one plain sentence that it is disconnected and that the WhatsApp row of the Agent tab connects it again (with a `blockedReason`, why it cannot be connected yet instead), and never offer it again yourself.",
    "- `connected: true`: write the titles (below), run `publish_whatsapp_forms` if this build changed a writable entity or an `open` entity whose create tool is not switched off is missing from `flows`, and say their WhatsApp number answers too; when that run answers `reconnectRequired: true` or a `channel.status` other than `active`, say instead that WhatsApp is not answering, as in the `needs_reconnect` case.",
    "- a `blockedReason` on a project not connected: say nothing about WhatsApp unless the owner asks.",
    "- not connected yet: when the business's customers reach it on WhatsApp, OFFER in one plain sentence to answer them there too, on the number they already use: an offer the owner may decline, never a push, made once in this conversation.",
  ];
  let previous = -1;
  for (const item of cases) {
    const at = step.indexOf(item);
    assert.ok(at > previous, `in order: ${item}`);
    previous = at;
  }
  // A blocked or banned number is never promised a reconnect; only a number
  // the owner disconnected is pointed back at the Agent tab, and only when
  // nothing blocks it.
  const bullets = bulletsOf(arcStep8Raw(), "   ");
  for (const prefix of ["- a `blockedReason` on a connected number", "- `status` `needs_reconnect`"]) {
    assert.doesNotMatch(caseOf(bullets, prefix), /connects it again/, `${prefix}: no reconnect promised`);
  }
  assert.match(
    caseOf(bullets, "- `status` `disconnected`"),
    /connects it again \(with a `blockedReason`, why it cannot be connected yet instead\)/
  );
  // A number Meta refuses to send from is still `active`: step 8 does its
  // upkeep and says why it is not answering, one reason at a time, never
  // naming money and never promising that a reconnect lifts it.
  const blocked = caseOf(bullets, "- `connected: true`");
  assert.match(
    blocked,
    /as in the `needs_reconnect` case\. Otherwise, with a `sendBlockedReason` \(in the status or in that run's `channel`\), Meta refuses every reply from the number: say instead, in one plain sentence, that WhatsApp is not answering and why/
  );
  assert.match(blocked, /`payment_required`: a problem with the payment method on their WhatsApp account, which they fix in Meta;/);
  assert.match(blocked, /`account_restricted`: a restriction Meta put on the account or the number, until Meta lifts it;/);
  assert.match(blocked, /`not_registered`: Meta says the number is not registered for sending\)/);
  assert.match(blocked, /with no price or amount, and never promise that connecting again fixes it; say it at most once in this conversation\.$/);
  assert.doesNotMatch(blocked, /connects it again/, "no reconnect promised for a send block either");
  assert.match(step, /On a yes, write the titles; then the OWNER connects it/);
  assert.match(step, /never ask for the phone number, a code or a token to connect it\./);
  assert.match(step, /Tell them in plain words what Meta changes in their WhatsApp Business app, with no price or amount/);
  assert.match(
    step,
    /A no, or any reply that is not a yes, closes the offer: never raise WhatsApp again in this conversation unless the owner does\./
  );
  assert.match(
    step,
    /\*\*The titles:\*\* every home chip whose label runs past 24 characters gets a short title, sent as the home's whole current set with `set_whatsapp_titles` and `replace: true` \(an empty list when no label is that long\), so the titles of chips that are gone go too/
  );
  assert.match(step, /`read_doc whatsapp-channel` has the limits, the list for the owner and the rest of the channel/);
});

test("the build order names step 8, and the policy bag's key list routes whatsappTitles to its tool", () => {
  const start = hosted.indexOf("## Build order (hosted)");
  const order = flat(hosted.slice(start, hosted.indexOf("\n## ", start + 1)));
  assert.match(
    order,
    /Last of all, step 8 reads `get_whatsapp_status`: it keeps a connected WhatsApp number answering, leaves a number the owner disconnected alone, and offers the channel once when the project can connect and the business's customers use WhatsApp/
  );
  const bagStart = hosted.indexOf("- `policies` —");
  const bag = flat(hosted.slice(bagStart, hosted.indexOf("\n- `dailyTokenBudget`", bagStart)));
  assert.match(
    bag,
    /`whatsappTitles` \(`\{query: title\}`: the short WhatsApp list titles of the home's chips\) is written only through `set_whatsapp_titles`, which merges title by title \(or replaces the set with `replace: true`\)/
  );
});

test("as in the in-app Builder's WHATSAPP rule: a disconnect is the owner's choice, needs_reconnect a breakage, and each nudge and the offer come once per conversation", () => {
  const status = tool("get_whatsapp_status").config.description;
  for (const [surface, words] of [
    ["the status description", status],
    ["the channel doc", flat(channelDoc)],
    ["the hosted-agent contract", flat(hosted)],
  ]) {
    assert.doesNotMatch(words, /needs_reconnect`? or `?disconnected/, `${surface}: a disconnect is never grouped with a breakage`);
    assert.doesNotMatch(words, /or the number was disconnected/, `${surface}: the breakage sentence names no disconnect`);
    assert.doesNotMatch(words, /is or was connected/, `${surface}: a disconnected number has its own case, not the blocked one`);
  }
  assert.match(
    status,
    /disconnected: the owner ended it on purpose, so say nothing about WhatsApp unless they ask and never offer it again/
  );
  assert.match(status, /say each not-answering sentence and the offer at most once per conversation/);

  for (const [surface, bullets] of [
    ["the channel doc", bulletsOf(offeringRaw(), "")],
    ["step 8", bulletsOf(arcStep8Raw(), "   ")],
  ]) {
    const disconnected = caseOf(bullets, "- `status` `disconnected`");
    assert.match(disconnected, /disconnected on purpose \(in the Agent tab, or in Meta's own settings\)/, surface);
    assert.match(disconnected, /the owner's choice,? (and )?not a breakage/, surface);
    assert.match(disconnected, /say nothing about WhatsApp unless the owner asks/, surface);
    assert.match(disconnected, /never offer it again yourself\./i, surface);
    assert.doesNotMatch(disconnected, /at most once/, `${surface}: nothing is said unasked, so nothing repeats`);

    for (const prefix of ["- a `blockedReason` on a connected number", "- `status` `needs_reconnect`"]) {
      assert.match(caseOf(bullets, prefix), /[Ss]ay it at most once in this conversation\./, `${surface}: ${prefix}`);
    }
    // The run's own "not answering" points at the needs_reconnect case by name:
    // "the case above" would now be the deliberate disconnect.
    const connected = caseOf(bullets, "- `connected: true`");
    assert.match(connected, /as in the `needs_reconnect` case/, surface);
    assert.doesNotMatch(connected, /the case above/, surface);

    const offer = caseOf(bullets, "- not connected yet");
    assert.match(offer, /once in this conversation/, `${surface}: the offer is made once`);
    assert.match(offer, /A no, or any reply that is not a yes, closes the offer: never raise WhatsApp again in this conversation unless the owner does\./, surface);
  }
});

// --- F9: the handoff's WhatsApp number is not the channel ----------------------------

/**
 * Every clause telling the model never to ask for a number, with the words
 * that lead into it in its sentence, up to the next "and never": a trailing
 * "and never offer to connect it" must not pass for the scope of the ask.
 */
const neverAskForANumber = (text) =>
  [...flat(text).matchAll(/[^.;:]*\bnever ask(?: me)? for\b(?:(?!\band never\b)[^.;])*/gi)]
    .map((match) => match[0].trim())
    .filter((clause) => /\bnumber\b/.test(clause));

test("never asking for a phone number is about CONNECTING WhatsApp only, on every surface that says it", () => {
  // The hosted arc asks the owner for a WhatsApp handoff number (question 3)
  // and for a phone or an email for privacy requests: a bare "never ask for a
  // phone number" anywhere would forbid both.
  const surfaces = [
    ["the channel doc", channelDoc],
    ["the hosted-agent contract", hosted],
    ["the hosted prompt", prompts],
    ["the server instructions", INSTRUCTIONS],
    ...TOOL_NAMES.map((name) => [name, tool(name).config.description]),
  ];
  for (const [surface, text] of surfaces) {
    const clauses = neverAskForANumber(text);
    assert.ok(clauses.length > 0, `${surface} says it`);
    for (const clause of clauses) {
      assert.match(clause, /connect/i, `${surface}: "${clause}" is about connecting`);
    }
  }
});

test("the handoff's WhatsApp number or link is still asked for, confirmed and stored whatever the channel's status, as in the in-app Builder's rule", () => {
  // The in-app Builder's WHATSAPP rule: it "never changes HANDOFF: a WhatsApp
  // number or link for handing a customer to a person is asked, confirmed ...
  // and stored in policies.handoff.whatsapp exactly as HANDOFF says, on every
  // deployment and whatever get_whatsapp_status answers". So every "say
  // nothing about WhatsApp" on these surfaces is about the channel alone.
  assert.match(
    tool("get_whatsapp_status").config.description,
    /To connect it, never ask for a phone number, a code or a token; a WhatsApp handoff number or link is still asked, confirmed and stored in policies\.handoff\.whatsapp, whatever the status\./
  );

  const step = arcStep8();
  const carveOut = step.indexOf(
    'Here "WhatsApp" means the channel alone. Step 8 never changes the handoff: a WhatsApp number or link for handing a customer to a person is asked for in the handoff question (question 3), confirmed by the owner and stored in `policies.handoff.whatsapp`, whatever `get_whatsapp_status` answers; never asking for a phone number or a token is about CONNECTING WhatsApp only.'
  );
  assert.notEqual(carveOut, -1, "step 8 says it");
  assert.ok(carveOut < step.indexOf("- `available: false`"), "before step 8's first case, so it governs every one");

  const questionStart = hosted.indexOf("3. **Handoff email**");
  assert.notEqual(questionStart, -1);
  const question = flat(hosted.slice(questionStart, hosted.indexOf("\n4. **", questionStart)));
  assert.match(
    question,
    /A WhatsApp number or link the owner types or confirms for handing customers to a person goes in `policies\.handoff\.whatsapp` the same way, whatever `get_whatsapp_status` answers \(step 8\): it connects no WhatsApp channel\./,
    "the handoff question step 8 points at says so too"
  );

  const text = flat(channelDoc);
  assert.match(
    text,
    /That rule is about connecting alone: a WhatsApp number or link for handing a customer to a person is still asked for \(see the handoff, after the status fields below\)\./
  );
  assert.match(
    text,
    /`policies\.handoff\.whatsapp` is a different thing: the number a website visitor is sent to when they ask for a person\. Storing it connects nothing, and asking for it belongs to the handoff, not to connecting: a WhatsApp number or link for handing a customer to a person is asked for in the hosted-agent contract's handoff question \(question 3\), confirmed by the owner and stored there, whatever `get_whatsapp_status` answers \(`available: false` included\)\./
  );
  const offering = flat(offeringRaw());
  const intro = offering.indexOf(
    "Here WhatsApp means the channel alone: no case below changes the handoff, whose WhatsApp number or link is asked for, confirmed and stored whatever the status (above)."
  );
  assert.notEqual(intro, -1, "the doc's copy of step 8 says it");
  assert.ok(intro < offering.indexOf("- `available: false`"), "before its first case");
  assert.match(
    text,
    /- Never ask for, read, repeat or store a phone number, a code, a token or a password to CONNECT WhatsApp, and never offer to connect it for the owner\. That is about connecting alone: a WhatsApp number or link for handing a customer to a person \(`policies\.handoff\.whatsapp`\) is still asked for, confirmed and stored, whatever `get_whatsapp_status` answers\./
  );
  // Storing it still connects nothing: the channel is the owner's own click.
  assert.match(text, /- Never treat `policies\.handoff\.whatsapp` as the channel: the owner's own connect is the only way on\./);
});

// --- the server instructions and the hosted prompt ------------------------------------

test("the server instructions carry the offer in ONE line: last, only where customers use WhatsApp, never asking for a number or a token to connect it", () => {
  const lines = INSTRUCTIONS.split("\n").filter((line) => /whatsapp/i.test(line));
  assert.equal(lines.length, 1, "one line");
  const [line] = lines;
  assert.equal(
    line,
    "Last, if get_whatsapp_status allows and the business's customers use WhatsApp, offer it once (read_doc whatsapp-channel); to connect it, never ask for a phone number or a token."
  );
  assert.ok(INSTRUCTIONS.endsWith(line), "the last line, after the BYOK rule");
});

/** The hosted prompt's one WhatsApp line. */
function promptWhatsAppLine() {
  const lines = prompts.split("\n").filter((line) => /whatsapp/i.test(line));
  assert.equal(lines.length, 1, "one line");
  return lines[0];
}

test("the hosted prompt's wrap-up ends with WhatsApp, in ONE line of the owner's voice", () => {
  const line = promptWhatsAppLine();
  assert.match(line, /^Last, WhatsApp: call get_whatsapp_status; if WhatsApp is not available, say nothing about it\./);
  assert.match(
    line,
    /Only when you are about to offer it or look after my connected number, read_doc "whatsapp-channel" first\./
  );
  assert.match(
    line,
    /If my WhatsApp is already connected, give my home's long chips their short WhatsApp titles \(set_whatsapp_titles\), republish my WhatsApp forms \(publish_whatsapp_forms\) if you changed what my visitors fill in, and tell me if it has stopped answering\./
  );
  assert.match(
    line,
    /If it is not connected yet and my customers write to me on WhatsApp, offer me once, in one sentence, to answer them there too; if I say yes, give my chips their short titles, then I connect my own number in the Agent tab, so never ask me for the number, a code or a token\.$/
  );
  const wrapUp = prompts.indexOf("The moment the publish succeeds, wrap up in plain words");
  const offer = prompts.indexOf(line);
  const close = prompts.indexOf("Ask me before anything destructive.", wrapUp);
  assert.ok(wrapUp !== -1 && offer > wrapUp && close > offer, "after the wrap-up, before the closing line");
  assert.equal(prompts.slice(wrapUp, close).split("\n").length, 3, "the wrap-up line, the WhatsApp line, then the close");
  assert.equal(line.includes("—"), false);
  assert.doesNotMatch(line, MONEY);
});

test("the channel doc is read only after the status, on the way to an offer or upkeep: never while WhatsApp is off", () => {
  // The doc is about 15 KB. While the channel is off (every WhatsApp endpoint
  // answers 503 whatsapp_not_configured, which reads as available: false) a
  // hosted build ends with one small status call and says nothing, so no
  // surface may send the model to the doc before that call, whatever it answers.
  const line = promptWhatsAppLine();
  const status = line.indexOf("call get_whatsapp_status");
  const doc = line.indexOf('read_doc "whatsapp-channel"');
  assert.ok(status !== -1 && doc > status, "the hosted prompt calls the status before any read of the doc");
  assert.match(
    line.slice(status, doc),
    /if WhatsApp is not available, say nothing about it\. Only when you are about to offer it or look after my connected number, $/,
    "and reads it only on the way to an offer or upkeep"
  );

  const described = tool("get_whatsapp_status").config.description;
  assert.ok(
    described.endsWith("Read brander://docs/whatsapp-channel only to offer or maintain it."),
    "the status tool sends the model to the doc only for an offer or upkeep"
  );
  assert.doesNotMatch(described, /Read brander:\/\/docs\/whatsapp-channel first/, "never before the status call itself");

  const [instructed] = INSTRUCTIONS.split("\n").filter((text) => /whatsapp/i.test(text));
  assert.match(instructed, /offer it once \(read_doc whatsapp-channel\)/, "the server instructions read it for the offer");

  const step = arcStep8();
  const call = step.indexOf("Call `get_whatsapp_status`");
  assert.ok(call !== -1 && step.indexOf("`read_doc whatsapp-channel`") > call, "step 8 calls the status before it points at the doc");
});
