// The data-processing engagement (DPA) is what makes our handling of an
// owner's visitors lawful: they accept it once, in one click, at
// branderux.com/legal/dpa/accept. The MCP surface only REPORTS the state so an
// agent can ask at a natural moment — `whoami.dpaAccepted` plus the URL, and a
// sentence on a successful publish. Accounts created before 2026-09-11 signed
// up under the previous terms and count as accepted here, and NOTHING is ever
// refused for a missing acceptance: the site is live either way.
// Dependency-free (node:test) like the rest of this suite.
import assert from "node:assert/strict";
import { test } from "node:test";

// publish_site only registers with the agentic-apps switch on (an MCP deploy
// ahead of the client must not mint live sites) — set it before the import
// that registers the tools.
process.env.AGENTIC_APPS_ENABLED = "1";

const { registerProjectTools } = await import("../dist/tools/projects.js");
const { registerAgentTools } = await import("../dist/tools/agent.js");
const { DPA_ACCEPT_URL, DPA_PUBLISH_NOTE, DPA_VERSION, hasAcceptedDpa } = await import(
  "../dist/lib/dpa.js"
);

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";
const ACCEPTED = { version: "2026-09-11", at: "2026-09-11T09:30:00Z" };

/** A fake ApiClient: `me` answers /auth/me, `entities` answers the entity list. */
function fakeApi({ me = {}, entities = [], meThrows = false } = {}) {
  const calls = { get: [], put: [] };
  return {
    calls,
    get: async (path) => {
      calls.get.push(path);
      if (path === "/auth/me") {
        if (meThrows) throw new Error("/auth/me failed");
        return me;
      }
      if (path.endsWith("/entities")) return entities;
      return [];
    },
    put: async (path, body) => {
      calls.put.push({ path, body });
      return { slug: body.slug, status: "live", url: `https://${body.slug}.branderux.app` };
    },
  };
}

function handler(register, api, name) {
  const tools = new Map();
  register({ registerTool: (toolName, _config, fn) => tools.set(toolName, fn) }, api);
  const found = tools.get(name);
  assert.ok(found, `${name} is registered`);
  return found;
}

function config(register, api, name) {
  const configs = new Map();
  register({ registerTool: (toolName, toolConfig) => configs.set(toolName, toolConfig) }, api);
  const found = configs.get(name);
  assert.ok(found, `${name} is registered`);
  return found;
}

const whoami = (api) => handler(registerProjectTools, api, "whoami");
const publishSite = (api) => handler(registerAgentTools, api, "publish_site");

test("the accept URL and the document version are the ones all three repos build against", () => {
  assert.equal(DPA_ACCEPT_URL, "https://branderux.com/legal/dpa/accept");
  assert.equal(DPA_VERSION, "2026-09-11");
});

test("whoami reports an ACCEPTED account, and always carries the accept URL", async () => {
  const api = fakeApi({ me: { id: "u1", email: "owner@example.com", dpaAccepted: ACCEPTED } });
  const result = await whoami(api)({});
  assert.notEqual(result.isError, true);
  assert.equal(result.structuredContent.dpaAccepted, true);
  assert.equal(result.structuredContent.dpaAcceptUrl, DPA_ACCEPT_URL);
  assert.equal(result.structuredContent.user.email, "owner@example.com");
});

test("whoami reports a NEW account that has not accepted", async () => {
  const api = fakeApi({ me: { dpaAccepted: null, createdAt: "2026-09-12T08:00:00Z" } });
  const { structuredContent } = await whoami(api)({});
  assert.equal(structuredContent.dpaAccepted, false);
  assert.equal(structuredContent.dpaAcceptUrl, DPA_ACCEPT_URL);
});

test("a GRANDFATHERED account counts as accepted — it is never asked", async () => {
  const api = fakeApi({ me: { dpaAccepted: null, createdAt: "2026-08-01T10:00:00Z" } });
  assert.equal((await whoami(api)({})).structuredContent.dpaAccepted, true);
});

test("the cutoff is 2026-09-11T00:00:00Z: on or after it, acceptance is asked", () => {
  assert.equal(hasAcceptedDpa({ dpaAccepted: null, createdAt: "2026-09-10T23:59:59Z" }), true);
  assert.equal(hasAcceptedDpa({ dpaAccepted: null, createdAt: "2026-09-11T00:00:00Z" }), false);
  assert.equal(hasAcceptedDpa({ dpaAccepted: null, createdAt: "2026-09-11T00:00:01Z" }), false);
});

test("an unreadable account never crashes whoami — the flag stays a boolean", async () => {
  for (const me of [null, {}, { createdAt: "not a date" }, { dpaAccepted: null }]) {
    const api = fakeApi({ me });
    const { structuredContent } = await whoami(api)({});
    assert.equal(typeof structuredContent.dpaAccepted, "boolean");
    assert.equal(structuredContent.dpaAccepted, false);
  }
});

test("an acceptance already flattened to a boolean is read as one", () => {
  assert.equal(hasAcceptedDpa({ dpaAccepted: true }), true);
  assert.equal(hasAcceptedDpa({ dpaAccepted: false, createdAt: "2026-09-20T00:00:00Z" }), false);
});

test("whoami's description names the flag, the one-click page, and that it blocks nothing", () => {
  const { description } = config(registerProjectTools, fakeApi(), "whoami");
  assert.match(description, /dpaAccepted/);
  assert.ok(description.includes(DPA_ACCEPT_URL), "the description carries the accept URL");
  assert.match(description, /dpaAcceptUrl/);
  assert.match(description, /one click/);
  assert.match(description, /never blocks|no publish, waits/);
});

test("publish_site appends the exact sentence when the account has not accepted", async () => {
  const api = fakeApi({ me: { dpaAccepted: null, createdAt: "2026-09-11T12:00:00Z" } });
  const result = await publishSite(api)({ projectId: PROJECT, slug: "blossom" });
  assert.notEqual(result.isError, true, "publishing is NEVER refused for a missing acceptance");
  assert.equal(result.structuredContent.url, "https://blossom.branderux.app");
  assert.deepEqual(result.structuredContent.notes, [
    "The data-processing engagement has not been accepted for this account yet: ask the owner to open " +
      "https://branderux.com/legal/dpa/accept and accept it (one click); the site is live meanwhile.",
  ]);
  assert.equal(result.structuredContent.notes[0], DPA_PUBLISH_NOTE);
  assert.match(result.content[0].text, /has not been accepted for this account yet/);
});

test("an accepted or grandfathered account gets no note at all", async () => {
  for (const me of [
    { dpaAccepted: ACCEPTED },
    { dpaAccepted: null, createdAt: "2026-05-04T00:00:00Z" },
  ]) {
    const api = fakeApi({ me });
    const { structuredContent } = await publishSite(api)({ projectId: PROJECT, slug: "blossom" });
    assert.equal("notes" in structuredContent, false);
  }
});

test("the publish still succeeds when the account cannot be read — and says nothing", async () => {
  for (const api of [fakeApi({ meThrows: true }), fakeApi({ me: null })]) {
    const result = await publishSite(api)({ projectId: PROJECT, slug: "blossom" });
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent.status, "live");
    assert.equal("notes" in result.structuredContent, false);
  }
});

test("the site is published BEFORE the account is read — the note never gates it", async () => {
  const api = fakeApi({ me: { dpaAccepted: null, createdAt: "2026-09-11T12:00:00Z" } });
  await publishSite(api)({ projectId: PROJECT, slug: "blossom" });
  assert.deepEqual(api.calls.put, [
    { path: `/projects/${PROJECT}/site`, body: { slug: "blossom" } },
  ]);
  assert.ok(api.calls.get.includes("/auth/me"));
});

test("publish_site's description tells the agent to relay the notes and that they are not failures", () => {
  const { description } = config(registerAgentTools, fakeApi(), "publish_site");
  assert.match(description, /notes/);
  assert.match(description, /plain words/);
  assert.match(description, /never a failure/);
  assert.match(description, /the site is live/);
});

test("hasAcceptedDpa: a bare createdAt (the server's LocalDateTime, no zone) is read as UTC, not local time", () => {
  // Spring serializes LocalDateTime without a zone designator; Date.parse would
  // read that as the machine's LOCAL time and move the cutoff by the offset.
  assert.equal(hasAcceptedDpa({ createdAt: "2026-09-10T23:00:00" }), true);
  assert.equal(hasAcceptedDpa({ createdAt: "2026-09-10T23:59:59.123456" }), true);
  assert.equal(hasAcceptedDpa({ createdAt: "2026-09-11T01:00:00" }), false);
  // A timestamp that names its zone passes through untouched.
  assert.equal(hasAcceptedDpa({ createdAt: "2026-09-11T02:00:00+03:00" }), true);
  assert.equal(hasAcceptedDpa({ createdAt: "2026-09-11T00:00:00Z" }), false);
});
