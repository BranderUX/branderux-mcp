// define_entity is also the ordinary UPDATE path — the builder re-defines an
// entity whenever its schema changes. A definition PUT with no accessPolicy
// resolves server-side to public-read and OVERWRITES the stored row, so the
// tool carries the stored policy forward: a schema-only update must never
// reopen an INTAKE entity (enquiries, bookings, orders) to every visitor and
// every MCP client. Dependency-free (node:test) like the rest of this suite.
import assert from "node:assert/strict";
import { test } from "node:test";

import { registerAgentTools } from "../dist/tools/agent.js";

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";
const SCHEMA = {
  type: "object",
  properties: { note: { type: "string", description: "What the visitor asked" } },
};

/** A fake ApiClient recording every call; `entities` is what GET /entities answers. */
function fakeApi({ entities = [], getThrows = false } = {}) {
  const calls = { get: [], put: [] };
  return {
    calls,
    get: async (path) => {
      calls.get.push(path);
      if (getThrows) throw new Error("entities lookup failed");
      return entities;
    },
    put: async (path, body) => {
      calls.put.push({ path, body });
      return { name: "enquiries", ...body };
    },
  };
}

/** Register the agent tools on a fake McpServer and hand back define_entity's handler. */
function defineEntity(api) {
  const tools = new Map();
  registerAgentTools({ registerTool: (name, _config, handler) => tools.set(name, handler) }, api);
  const handler = tools.get("define_entity");
  assert.ok(handler, "define_entity is registered");
  return handler;
}

const putBody = (api) => {
  assert.equal(api.calls.put.length, 1, "exactly one definition PUT");
  return api.calls.put[0].body;
};

test("a re-definition with no accessPolicy carries the STORED one forward", async () => {
  const api = fakeApi({
    entities: [
      { name: "products", accessPolicy: "public-read" },
      { name: "enquiries", accessPolicy: "end-user-scoped", writePolicy: "open" },
    ],
  });
  await defineEntity(api)({ projectId: PROJECT, name: "enquiries", jsonSchema: SCHEMA });
  assert.deepEqual(putBody(api), { jsonSchema: SCHEMA, accessPolicy: "end-user-scoped" });
  assert.deepEqual(api.calls.get, [`/projects/${PROJECT}/entities`]);
});

test("an explicit accessPolicy wins — and costs no lookup", async () => {
  const api = fakeApi({ entities: [{ name: "enquiries", accessPolicy: "end-user-scoped" }] });
  await defineEntity(api)({
    projectId: PROJECT,
    name: "enquiries",
    jsonSchema: SCHEMA,
    accessPolicy: "owner-only",
  });
  assert.equal(putBody(api).accessPolicy, "owner-only");
  assert.deepEqual(api.calls.get, []);
});

test("a brand-new entity sends no accessPolicy — the server default applies", async () => {
  const api = fakeApi({ entities: [{ name: "products", accessPolicy: "public-read" }] });
  await defineEntity(api)({ projectId: PROJECT, name: "enquiries", jsonSchema: SCHEMA });
  assert.equal("accessPolicy" in putBody(api), false);
});

test("a failed or empty definition lookup never fails the definition", async () => {
  for (const api of [fakeApi({ getThrows: true }), fakeApi({ entities: null })]) {
    const result = await defineEntity(api)({
      projectId: PROJECT,
      name: "enquiries",
      jsonSchema: SCHEMA,
    });
    assert.notEqual(result.isError, true);
    assert.equal("accessPolicy" in putBody(api), false);
  }
});

test("a stored accessPolicy that is not a string is ignored", async () => {
  const api = fakeApi({ entities: [{ name: "enquiries", accessPolicy: 7 }] });
  await defineEntity(api)({ projectId: PROJECT, name: "enquiries", jsonSchema: SCHEMA });
  assert.equal("accessPolicy" in putBody(api), false);
});

test("the carried policy never displaces writePolicy or source", async () => {
  const api = fakeApi({ entities: [{ name: "enquiries", accessPolicy: "end-user-scoped" }] });
  await defineEntity(api)({
    projectId: PROJECT,
    name: "enquiries",
    jsonSchema: SCHEMA,
    writePolicy: "open",
  });
  assert.deepEqual(putBody(api), {
    jsonSchema: SCHEMA,
    accessPolicy: "end-user-scoped",
    writePolicy: "open",
  });
});
