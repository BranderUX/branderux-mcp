// A visitor-writable entity holding a money field is the shape of a SALE, and
// a sale concluded in a chat is a distance contract: the buyer gets
// disclosure and cancellation rights (Consumer Protection Law s.14ג) that the
// platform does not implement yet. So a publish of such a site carries a
// warning: the assistant may take the request, the business confirms it
// outside the chat, and nothing concludes a sale or takes payment. It is a
// warning, never a refusal. Dependency-free (node:test) like its siblings.
import assert from "node:assert/strict";
import { test } from "node:test";

// publish_site registers only with the agentic-apps switch on.
process.env.AGENTIC_APPS_ENABLED = "1";

const { registerAgentTools } = await import("../dist/tools/agent.js");
const { ORDER_TAKING_NOTE, priceFields, pricedRequestEntities } = await import(
  "../dist/lib/priced-orders.js"
);
const { DPA_PUBLISH_NOTE } = await import("../dist/lib/dpa.js");

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";
const NEW_ACCOUNT = { dpaAccepted: null, createdAt: "2026-09-11T12:00:00Z" };
const OLD_ACCOUNT = { dpaAccepted: null, createdAt: "2026-01-02T12:00:00Z" };

/** An entity definition as list_entities returns it. */
const entity = (name, writePolicy, properties) => ({
  name,
  writePolicy,
  jsonSchema: { type: "object", properties },
});

const ORDERS = entity("orders", "open", {
  item: { type: "string", description: "What they ordered" },
  totalPrice: { type: "number", description: "What it comes to" },
});

/** A fake ApiClient: `entities` answers the entity list, `me` answers /auth/me. */
function fakeApi({ entities = [], me = OLD_ACCOUNT, entitiesThrow = false } = {}) {
  const calls = { get: [], put: [] };
  return {
    calls,
    get: async (path) => {
      calls.get.push(path);
      if (path === "/auth/me") return me;
      if (path.endsWith("/entities")) {
        if (entitiesThrow) throw new Error("entities lookup failed");
        return entities;
      }
      return [];
    },
    put: async (path, body) => {
      calls.put.push({ path, body });
      return { slug: body.slug, status: "live", url: `https://${body.slug}.branderux.app` };
    },
  };
}

function publishSite(api) {
  const tools = new Map();
  registerAgentTools({ registerTool: (name, _config, fn) => tools.set(name, fn) }, api);
  const handler = tools.get("publish_site");
  assert.ok(handler, "publish_site is registered");
  return handler;
}

const notes = async (api) =>
  (await publishSite(api)({ projectId: PROJECT, slug: "blossom" })).structuredContent.notes;

test("a NUMERIC field whose name reads as money is a price field", () => {
  const fields = (properties) => priceFields({ type: "object", properties });
  assert.deepEqual(fields({ price: { type: "number" } }), ["price"]);
  assert.deepEqual(fields({ totalPrice: { type: "number" } }), ["totalPrice"]);
  assert.deepEqual(fields({ amount_due: { type: "integer" } }), ["amount_due"]);
  assert.deepEqual(fields({ unitCost: { type: "number" } }), ["unitCost"]);
  assert.deepEqual(fields({ Sum: { type: "number" } }), ["Sum"]);
  assert.deepEqual(fields({ TOTAL: { type: ["number", "null"] } }), ["TOTAL"]);
  assert.deepEqual(fields({ item: { type: "string" }, price: { type: "number" } }), ["price"]);
});

test("a field that is not numeric, or not money, is not one", () => {
  const fields = (properties) => priceFields({ type: "object", properties });
  // The contract makes money a JSON number; a stringly-typed price is not a price field.
  assert.deepEqual(fields({ price: { type: "string" } }), []);
  assert.deepEqual(fields({ quantity: { type: "number" }, guests: { type: "integer" } }), []);
  assert.deepEqual(fields({ note: { type: "string" } }), []);
  assert.deepEqual(fields({ price: {} }), []);
  assert.deepEqual(priceFields(null), []);
  assert.deepEqual(priceFields({ type: "object" }), []);
});

test("only a VISITOR-writable entity counts — a read-only price list does not", () => {
  const priced = (writePolicy) => [entity("orders", writePolicy, { total: { type: "number" } })];
  assert.deepEqual(pricedRequestEntities(priced("open")), ["orders"]);
  assert.deepEqual(pricedRequestEntities(priced("end-user-owned")), ["orders"]);
  assert.deepEqual(pricedRequestEntities(priced("none")), []);
  assert.deepEqual(pricedRequestEntities([entity("products", undefined, { price: { type: "number" } })]), []);
  assert.deepEqual(pricedRequestEntities([entity("enquiries", "open", { note: { type: "string" } })]), []);
  assert.deepEqual(pricedRequestEntities(null), []);
});

test("publish_site appends the exact warning for a site that takes priced requests", async () => {
  const api = fakeApi({ entities: [entity("products", "none", { price: { type: "number" } }), ORDERS] });
  const result = await publishSite(api)({ projectId: PROJECT, slug: "blossom" });
  assert.notEqual(result.isError, true, "publishing is NEVER refused for this");
  assert.equal(result.structuredContent.url, "https://blossom.branderux.app");
  assert.deepEqual(result.structuredContent.notes, [
    "This site takes requests with prices. Until the distance-selling pack exists, the assistant may only " +
      "take requests the business confirms outside the chat; it must not conclude a sale or take payment " +
      "(Consumer Protection Law s.14ג).",
  ]);
  assert.equal(result.structuredContent.notes[0], ORDER_TAKING_NOTE);
  assert.match(result.content[0].text, /must not conclude a sale or take payment/);
});

test("a site with no priced request gets no warning", async () => {
  const api = fakeApi({
    entities: [
      entity("products", "none", { price: { type: "number" } }),
      entity("enquiries", "open", { message: { type: "string" } }),
    ],
  });
  const result = await publishSite(api)({ projectId: PROJECT, slug: "blossom" });
  assert.equal("notes" in result.structuredContent, false);
});

test("a failing entity lookup never fails the publish — and warns about nothing", async () => {
  for (const api of [fakeApi({ entitiesThrow: true }), fakeApi({ entities: null })]) {
    const result = await publishSite(api)({ projectId: PROJECT, slug: "blossom" });
    assert.notEqual(result.isError, true);
    assert.equal(result.structuredContent.status, "live");
    assert.equal("notes" in result.structuredContent, false);
  }
});

test("both notes ride together, the engagement first", async () => {
  const api = fakeApi({ entities: [ORDERS], me: NEW_ACCOUNT });
  assert.deepEqual(await notes(api), [DPA_PUBLISH_NOTE, ORDER_TAKING_NOTE]);
});

test("the warning names the law and the one thing the assistant may do", () => {
  assert.match(ORDER_TAKING_NOTE, /Consumer Protection Law s\.14ג/);
  assert.match(ORDER_TAKING_NOTE, /confirms outside the chat/);
  assert.match(ORDER_TAKING_NOTE, /must not conclude a sale or take payment/);
});
