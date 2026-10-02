// The owner's CRM, as an AI client sees it (owner-data build SPEC 6.8): the
// status read and the one-record send. Pinned here: names, annotations and
// exact descriptions; the Spring paths; no destination parameter (text planted
// in a lead can never point records at another CRM); strict output schemas;
// a deep scan proving no token, secret or setting beyond "what goes" leaves
// the status; and Spring's own 409 and 429 sentences reaching the AI through
// the real API client, with the owner's one-click link to Your CRM on the
// refusals the owner fixes there. Dependency-free (node:test) like its siblings.
import assert from "node:assert/strict";
import { test } from "node:test";

import { createApiClient } from "../dist/api-client.js";
import { APP_BASE } from "../dist/config.js";
import { READ_ONLY } from "../dist/tools/helpers.js";
import { registerOwnerCrmTools } from "../dist/tools/owner-crm.js";
import {
  BASE,
  CRM_STATUS,
  PROJECT,
  RECORD,
  SESSION,
  assertOutputStrict,
  callTool,
  fakeApi,
  registerAll,
  springAnswer,
} from "./owner-data-fixtures.mjs";

const INBOX = `${APP_BASE}/projects?tab=agent&project=${PROJECT}&section=inbox`;

const DESCRIPTIONS = {
  get_crm_status:
    "Whether the owner's CRM (HubSpot, monday CRM, Fireberry or Google Sheets) receives the leads, bookings, orders and requests the agent collects: which one, its state, the last send, how many records are waiting or need attention, and why. Connecting, reconnecting, disconnecting and what goes there are set only by a signed-in person, the owner or a manager, in the Agent tab.",
  send_record_to_crm:
    "Send ONE collected record to the CRM the owner already connected. There is no destination to choose. A record that is already there returns its link, and one already on its way returns queued; neither counts. At most 20 a day per project; records you add with add_record go only this way, and you cannot send records of a type the owner left out of the CRM.",
};

/** The CRM tools alone on a fake McpServer. */
function crmTools(api) {
  const tools = new Map();
  registerOwnerCrmTools({ registerTool: (name, config, handler) => tools.set(name, { config, handler }) }, api);
  return tools;
}

test("names, titles, annotations and exact descriptions", () => {
  const tools = crmTools(fakeApi());
  assert.deepEqual([...tools.keys()], ["get_crm_status", "send_record_to_crm"]);
  for (const [name, description] of Object.entries(DESCRIPTIONS)) {
    assert.equal(tools.get(name).config.description, description);
    assert.ok(tools.get(name).config.title.length > 0);
  }
  assert.deepEqual(tools.get("get_crm_status").config.annotations, READ_ONLY);
  assert.deepEqual(tools.get("send_record_to_crm").config.annotations, {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });
});

test("send_record_to_crm takes a project and a record, and no destination of any kind", () => {
  const input = crmTools(fakeApi()).get("send_record_to_crm").config.inputSchema;
  assert.deepEqual(Object.keys(input).sort(), ["projectId", "recordId"]);
  assert.equal(input.recordId.safeParse("not-a-uuid").success, false);
  const statusInput = crmTools(fakeApi()).get("get_crm_status").config.inputSchema;
  assert.deepEqual(Object.keys(statusInput), ["projectId"]);
});

test("each tool calls its Spring path; a destination in the arguments never reaches Spring", async () => {
  const api = fakeApi();
  const tools = registerAll(api);
  const status = await callTool(tools, "get_crm_status", { projectId: PROJECT });
  const sent = await callTool(tools, "send_record_to_crm", {
    projectId: PROJECT,
    recordId: RECORD,
    provider: "pipedrive",
    destination: "https://evil.example/hook",
  });
  assert.deepEqual(
    api.calls.map(({ method, path, body }) => [method, path, body]),
    [
      ["GET", `${BASE}/crm`, undefined],
      ["POST", `${BASE}/records/${RECORD}/send-to-crm`, undefined],
    ]
  );
  assertOutputStrict(tools, "get_crm_status", status);
  assertOutputStrict(tools, "send_record_to_crm", sent);
  assert.deepEqual(sent.structuredContent, { state: "queued", url: null });
});

test("the status keeps the listed keys only: a problem loses its record ids and fix", async () => {
  const tools = registerAll(fakeApi());
  const status = (await callTool(tools, "get_crm_status", { projectId: PROJECT })).structuredContent;
  assert.deepEqual(status, {
    connected: true,
    provider: "hubspot",
    providerLabel: "HubSpot",
    status: "active",
    accountLabel: "Cook & Bake (HubSpot 123456)",
    lastSentAt: "2026-09-28T10:01:00Z",
    waiting: 2,
    needsAttention: 3,
    held: 1,
    problems: [{ cause: "validation", count: 3, message: "HubSpot refused 3 records." }],
    whatGoes: { excludedEntities: ["enquiries"], includeConversation: true },
    manageUrl: `${INBOX}&crm=hubspot`,
  });
});

test("with no CRM connected the status says so plainly", async () => {
  const api = fakeApi(() => ({ ...structuredClone(CRM_STATUS), connection: null }));
  const tools = registerAll(api);
  const result = await callTool(tools, "get_crm_status", { projectId: PROJECT });
  assertOutputStrict(tools, "get_crm_status", result);
  assert.deepEqual(result.structuredContent, {
    connected: false,
    provider: null,
    providerLabel: null,
    status: null,
    accountLabel: null,
    lastSentAt: null,
    waiting: 0,
    needsAttention: 0,
    held: 0,
    problems: [],
    whatGoes: null,
    manageUrl: `${INBOX}&crm=connect`,
  });
});

test("an already-sent record answers with its link", async () => {
  const api = fakeApi(() => ({ state: "handed_off", url: "https://app.hubspot.com/contacts/1/record/0-1/2" }));
  const result = await callTool(registerAll(api), "send_record_to_crm", { projectId: PROJECT, recordId: RECORD });
  assert.deepEqual(result.structuredContent, { state: "handed_off", url: "https://app.hubspot.com/contacts/1/record/0-1/2" });
  const odd = await callTool(registerAll(fakeApi(() => ({ ok: true }))), "send_record_to_crm", {
    projectId: PROJECT,
    recordId: RECORD,
  });
  assert.equal(odd.isError, true, "an answer without a state is never reported as sent");
});

const PLANTED = {
  accessToken: "tok_crm_planted",
  refreshToken: "rt_crm_planted",
  clientSecret: "sec_crm_planted",
  password: "pw_crm_planted",
  apiKey: "key_crm_planted",
  credential: "cred_crm_planted",
  secret_enc: "enc_crm_planted",
};

/** Add secret-shaped keys everywhere in an object tree. */
function plant(value) {
  if (Array.isArray(value)) return value.map(plant);
  if (value === null || typeof value !== "object") return value;
  return { ...Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, plant(inner)])), ...PLANTED };
}

function keysOf(value, found = []) {
  if (Array.isArray(value)) value.forEach((item) => keysOf(item, found));
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      found.push(key);
      keysOf(inner, found);
    }
  }
  return found;
}

test("a deep scan finds no token, secret or setting beyond what goes in either result", async () => {
  const api = fakeApi((method, path) => plant(springAnswer(method, path)));
  const tools = registerAll(api);
  for (const [name, args] of [
    ["get_crm_status", { projectId: PROJECT }],
    ["send_record_to_crm", { projectId: PROJECT, recordId: RECORD }],
  ]) {
    const result = await callTool(tools, name, args);
    assertOutputStrict(tools, name, result);
    const leaked = keysOf(result.structuredContent).filter((key) => /secret|password|token|apikey|credential/i.test(key));
    assert.deepEqual(leaked, [], `${name} leaked ${leaked.join(", ")}`);
    const text = JSON.stringify(result);
    for (const value of Object.values(PLANTED)) assert.equal(text.includes(value), false, `${name} leaked a planted value`);
    for (const setting of ["assignToConnector", "accountEmail", "recordIds", "stoppedPaths", "otherPaths", "erasures"]) {
      assert.equal(text.includes(setting), false, `${name} carries ${setting}`);
    }
  }
});

/**
 * Call a CRM tool through the REAL API client against a stubbed fetch: every
 * call answers `status` and `body`, except a GET of the CRM status when
 * `crmStatus` is given.
 */
async function throughApiClient(name, args, status, body, headers = {}, crmStatus = null) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) =>
    crmStatus && (init.method ?? "GET") === "GET" && String(url).endsWith(`${BASE}/crm`)
      ? new Response(JSON.stringify(crmStatus), { status: 200, headers: { "Content-Type": "application/json" } })
      : new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
  try {
    return await callTool(crmTools(createApiClient(async () => "token")), name, args);
  } finally {
    globalThis.fetch = original;
  }
}

test("Spring's 409 and 429 sentences reach the AI as the tool's error text", async () => {
  const send = { projectId: PROJECT, recordId: RECORD };
  for (const sentence of [
    "Enquiries is not sent to HubSpot. Tick it in Your CRM first.",
    "This record is held with other unusual new records. Release them in Your CRM.",
  ]) {
    const result = await throughApiClient("send_record_to_crm", send, 409, { error: sentence });
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.endsWith(`409: ${sentence}`), result.content[0].text);
  }
  const capped = await throughApiClient(
    "send_record_to_crm",
    send,
    429,
    { error: "Your AI assistant already sent 20 records to your CRM today. Send more from the Inbox." },
    { "Retry-After": "3600" }
  );
  assert.equal(capped.isError, true);
  assert.match(capped.content[0].text, /429: Rate limited\. Retry after 3600s\. Your AI assistant already sent 20 records to your CRM today\. Send more from the Inbox\./);

  const catalog = await throughApiClient("send_record_to_crm", send, 400, { error: "Only collected records go to a CRM." });
  assert.match(catalog.content[0].text, /400: Only collected records go to a CRM\.$/);
});

test("a refusal the owner fixes in Your CRM ends with the one-click link there", async () => {
  const send = { projectId: PROJECT, recordId: RECORD };
  const link = (url) => ` The owner does this in the app: ${url}`;
  const nothing = await throughApiClient("send_record_to_crm", send, 409, {
    error: "No CRM is connected. Connect one in Your CRM.",
  });
  assert.equal(nothing.isError, true);
  assert.ok(
    nothing.content[0].text.endsWith(`409: No CRM is connected. Connect one in Your CRM.${link(`${INBOX}&crm=connect`)}`),
    nothing.content[0].text
  );

  // A connection that needs the owner: the link opens that CRM's screen (its reconnect screen).
  for (const [crmState, sentence] of [
    ["needs_reconnect", "HubSpot needs to be reconnected first."],
    ["pending_owner", "HubSpot is waiting for you to press Start sending in Your CRM."],
  ]) {
    const crmStatus = { ...structuredClone(CRM_STATUS), connection: { ...CRM_STATUS.connection, status: crmState } };
    const result = await throughApiClient("send_record_to_crm", send, 409, { error: sentence }, {}, crmStatus);
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.endsWith(`409: ${sentence}${link(`${INBOX}&crm=hubspot`)}`), result.content[0].text);
  }

  // The status unreadable: Your CRM's choices, still one click away.
  const unread = await throughApiClient("send_record_to_crm", send, 409, { error: "HubSpot needs to be reconnected first." });
  assert.ok(unread.content[0].text.endsWith(link(`${INBOX}&crm=connect`)), unread.content[0].text);

  // A refusal the AI relays as is (a type left out, held records, the daily cap) carries no link.
  const held = await throughApiClient("send_record_to_crm", send, 409, {
    error: "This record is held with other unusual new records. Release them in Your CRM.",
  });
  assert.doesNotMatch(held.content[0].text, /https?:\/\//);
});

test("get_record, get_conversation and get_crm_status declare and carry their links", async () => {
  const tools = registerAll(fakeApi());
  for (const [name, args, key, url] of [
    ["get_record", { projectId: PROJECT, recordId: RECORD }, "openInApp", `${INBOX}&record=${RECORD}`],
    [
      "get_conversation",
      { projectId: PROJECT, session: SESSION },
      "openInApp",
      `${APP_BASE}/projects?tab=agent&project=${PROJECT}&section=conversations&session=${SESSION}`,
    ],
    ["get_crm_status", { projectId: PROJECT }, "manageUrl", `${INBOX}&crm=hubspot`],
  ]) {
    assert.ok(tools.get(name).config.outputSchema[key], `${name} declares ${key}`);
    const result = await callTool(tools, name, args);
    assertOutputStrict(tools, name, result);
    assert.equal(result.structuredContent[key], url, `${name}.${key}`);
  }
});
