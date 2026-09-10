// The published site's privacy notice names WHO is responsible for a
// visitor's details and WHERE a privacy request reaches them. Both come from
// the owner's own answer: `policies.legalName` (the registered business name)
// and `policies.noticeContact` (one email or phone). A scraped footer can name
// the wrong company, and a scraped address can hand privacy requests to
// someone who never agreed to field them, so every prose surface says to ASK
// (ask_user) and never to guess. Guards the three surfaces plus the round-trip
// through the tool. Dependency-free (node:test) like its siblings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { registerAgentTools } from "../dist/tools/agent.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const source = read("src/tools/agent.ts");
const doc = read("src/docs/hosted-agent-contract.md");
const prompts = read("src/prompts.ts");

const flat = (text) => text.replace(/\s+/g, " ");
const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";

/** A fake ApiClient recording every call; GET answers with the stored config. */
function fakeApi(stored = { language: "he" }) {
  const calls = { get: [], put: [] };
  return {
    calls,
    get: async (path) => {
      calls.get.push(path);
      return { policies: stored };
    },
    put: async (path, body) => {
      calls.put.push({ path, body });
      return body;
    },
  };
}

function upsertAgentConfig(api) {
  const tools = new Map();
  registerAgentTools({ registerTool: (name, _config, handler) => tools.set(name, handler) }, api);
  const handler = tools.get("upsert_agent_config");
  assert.ok(handler, "upsert_agent_config is registered");
  return handler;
}

/** The `policies` describe() of upsert_agent_config, as text. */
function policiesDescribe() {
  const start = source.indexOf("policies: z");
  assert.notEqual(start, -1, "upsert_agent_config declares policies: z");
  const end = source.indexOf("homeScreen:", start);
  assert.notEqual(end, -1, "homeScreen follows the policies field");
  return flat(source.slice(start, end));
}

/** The doc's policies key list (the `- \`policies\`` bullet). */
function docPoliciesBullet() {
  const start = doc.indexOf("- `policies` —");
  assert.notEqual(start, -1, "the doc has a `policies` bullet");
  const end = doc.indexOf("\n- `dailyTokenBudget`", start);
  assert.notEqual(end, -1, "dailyTokenBudget follows it");
  return flat(doc.slice(start, end));
}

/** The hosted prompt's build arc, as text. */
function hostedArc() {
  const start = prompts.indexOf("Follow THE HOSTED BUILD ARC exactly:");
  assert.notEqual(start, -1, "the hosted prompt carries the build arc");
  const end = prompts.indexOf("Talk to me as a business owner", start);
  assert.notEqual(end, -1, "the arc ends before the tone rule");
  return flat(prompts.slice(start, end));
}

const surfaces = [
  ["policies describe()", policiesDescribe()],
  ["contract policies bullet", docPoliciesBullet()],
];

for (const [surface, text] of surfaces) {
  test(`${surface}: documents legalName and noticeContact, and what the notice shows`, () => {
    assert.match(text, /legalName/);
    assert.match(text, /noticeContact/);
    assert.match(text, /registered/i);
    assert.match(text, /privacy notice/i);
    assert.match(text, /privacy requests/i);
  });

  test(`${surface}: both are ASKED of the owner, never scraped or guessed`, () => {
    assert.match(text, /ask[_ ]?(the owner|user)/i);
    assert.match(text, /never scrape/i);
    assert.match(text, /guess/i);
  });
}

test("the contract's build arc asks for both at the agent-config step", () => {
  const start = doc.indexOf("3. `upsert_agent_config`");
  assert.notEqual(start, -1, "the arc has an upsert_agent_config step");
  const step = flat(doc.slice(start, doc.indexOf("\n4. ", start)));
  assert.match(step, /policies\.legalName/);
  assert.match(step, /policies\.noticeContact/);
  assert.match(step, /ASK/);
});

test("the hosted prompt's step 5 asks the owner for both, in owner words", () => {
  const arc = hostedArc();
  const step = arc.slice(arc.indexOf("5. upsert_agent_config"), arc.indexOf("6. Author"));
  assert.match(step, /policies\.legalName/);
  assert.match(step, /policies\.noticeContact/);
  assert.match(step, /registered name of my business/i);
  assert.match(step, /privacy requests/i);
  assert.match(step, /never take either from my website or guess one/i);
});

test("both keys round-trip through the tool, merged over the stored bag", async () => {
  const api = fakeApi({ language: "he", handoff: { email: "owner@example.com" } });
  const result = await upsertAgentConfig(api)({
    projectId: PROJECT,
    policies: { legalName: "פרחי לבלב בע״מ", noticeContact: "privacy@blossom.co.il" },
  });
  assert.notEqual(result.isError, true);
  assert.deepEqual(api.calls.put[0].body.policies, {
    language: "he",
    handoff: { email: "owner@example.com" },
    legalName: "פרחי לבלב בע״מ",
    noticeContact: "privacy@blossom.co.il",
  });
});

test("a later patch that does not mention them leaves the stored pair alone", async () => {
  const api = fakeApi({ legalName: "Blossom Flowers Ltd", noticeContact: "+972501234567" });
  await upsertAgentConfig(api)({ projectId: PROJECT, policies: { timezone: "Asia/Jerusalem" } });
  const { policies } = api.calls.put[0].body;
  assert.equal(policies.legalName, "Blossom Flowers Ltd");
  assert.equal(policies.noticeContact, "+972501234567");
  assert.equal(policies.timezone, "Asia/Jerusalem");
});

test("null removes one without touching the other", async () => {
  const api = fakeApi({ legalName: "Blossom Flowers Ltd", noticeContact: "+972501234567" });
  await upsertAgentConfig(api)({ projectId: PROJECT, policies: { legalName: null } });
  const { policies } = api.calls.put[0].body;
  assert.equal("legalName" in policies, false);
  assert.equal(policies.noticeContact, "+972501234567");
});
