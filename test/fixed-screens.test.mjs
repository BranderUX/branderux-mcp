// Fixed screens are the home screen's shape, stored for a DISTINCTIVE query the
// owner wants answered identically and instantly on any turn: the menu, the
// price list, opening hours. The wire rules this file guards are the ones a
// wrong write breaks silently — the PUT body key (`fixedScreens` on the same
// agent-config endpoint `set_home_screen` uses), the whole-set replace (`[]`
// clears), the 12-entry cap, and the fact that a fixed screen's bindings are
// the HOME's binding schema, one object, so the two can never drift apart.
// The verification that now rides beside the stored value has its own file
// (canned-screen-verification.test.mjs); here it only has to never displace
// what the write itself answers with.
// Dependency-free (node:test) like the rest of this suite; zod is the server's
// own dependency and is how the tools' input schemas are exercised.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

import { ApiError } from "../dist/api-client.js";
import { registerAgentTools } from "../dist/tools/agent.js";

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";
const CONFIG_PATH = `/projects/${PROJECT}/agent-config`;

/** One minimal fixed screen (the shape the server stores). */
const screen = (index = 0) => ({
  matchQuery: `show the menu ${index}`,
  screenId: "menu-screen",
  data: { header: { title: "Our menu" } },
});

/** A fake ApiClient recording every call; `config` is what GET/PUT answer with. */
function fakeApi({ config = {}, putThrows = null } = {}) {
  const calls = { get: [], put: [] };
  return {
    calls,
    get: async (path) => {
      calls.get.push(path);
      return config;
    },
    put: async (path, body) => {
      calls.put.push({ path, body });
      if (putThrows) throw putThrows;
      return { ...config, ...body };
    },
  };
}

/** Register the agent tools on a fake McpServer and hand back one tool's {config, handler}. */
function tool(name, api = fakeApi()) {
  const tools = new Map();
  registerAgentTools(
    { registerTool: (toolName, config, handler) => tools.set(toolName, { config, handler }) },
    api
  );
  const entry = tools.get(name);
  assert.ok(entry, `${name} is registered beside set_home_screen`);
  return entry;
}

const inputSchema = (name) => z.object(tool(name).config.inputSchema);
const putBody = (api) => {
  assert.equal(api.calls.put.length, 1, "exactly one config PUT");
  assert.equal(api.calls.put[0].path, CONFIG_PATH);
  return api.calls.put[0].body;
};

// --- set_fixed_screens: the write ------------------------------------------

test("the whole set rides as `fixedScreens` on the agent-config endpoint", async () => {
  const api = fakeApi({ config: { enabled: true } });
  const result = await tool("set_fixed_screens", api).handler({
    projectId: PROJECT,
    screens: [
      {
        matchQuery: "show the menu",
        screenId: "menu-screen",
        data: { header: { title: "Our menu" } },
        bindings: [{ path: "grid.items", entityName: "dishes", limit: 20 }],
        followUpText: "Here is today's menu.",
      },
      screen(2),
    ],
  });

  assert.notEqual(result.isError, true);
  assert.deepEqual(putBody(api), {
    fixedScreens: [
      {
        matchQuery: "show the menu",
        screenId: "menu-screen",
        data: { header: { title: "Our menu" } },
        bindings: [{ path: "grid.items", entityName: "dishes", limit: 20 }],
        followUpText: "Here is today's menu.",
      },
      { matchQuery: "show the menu 2", screenId: "menu-screen", data: { header: { title: "Our menu" } } },
    ],
  });
});

test("an entry with no bindings and no follow-up stores neither key (as the home does)", async () => {
  const api = fakeApi();
  await tool("set_fixed_screens", api).handler({
    projectId: PROJECT,
    screens: [{ ...screen(), bindings: [], followUpText: "" }],
  });
  assert.deepEqual(Object.keys(putBody(api).fixedScreens[0]), ["matchQuery", "screenId", "data"]);
});

test("`screens: []` CLEARS the set", async () => {
  const api = fakeApi();
  const result = await tool("set_fixed_screens", api).handler({ projectId: PROJECT, screens: [] });
  assert.notEqual(result.isError, true);
  assert.deepEqual(putBody(api), { fixedScreens: [] });
});

test("the write never touches the home screen or any policy", async () => {
  const api = fakeApi();
  await tool("set_fixed_screens", api).handler({ projectId: PROJECT, screens: [screen()] });
  assert.deepEqual(Object.keys(putBody(api)), ["fixedScreens"]);
  assert.deepEqual(api.calls.get, [], "no read-modify-write: the set replaces");
});

test("the stored set comes back from the RESPONSE, not from what was sent", async () => {
  const stored = [{ matchQuery: "show the menu", screenId: "menu-screen", data: {}, normalized: true }];
  const api = {
    calls: { put: [] },
    get: async () => null,
    put: async (path, body) => {
      api.calls.put.push({ path, body });
      return { fixedScreens: stored };
    },
  };
  const result = await tool("set_fixed_screens", api).handler({ projectId: PROJECT, screens: [screen()] });
  assert.deepEqual(result.structuredContent.fixedScreens, stored);
  assert.deepEqual(JSON.parse(result.content[0].text).fixedScreens, stored);
  // With no app client the write still answers, and says verification could not run.
  assert.equal(result.structuredContent.verification.unavailable, true);
});

test("a config response without fixedScreens answers an empty set, never undefined", async () => {
  const api = { get: async () => null, put: async () => ({ enabled: true }) };
  const result = await tool("set_fixed_screens", api).handler({ projectId: PROJECT, screens: [screen()] });
  assert.deepEqual(result.structuredContent.fixedScreens, []);
});

test("the server's 400 reaches the agent as a readable tool error, never a crash", async () => {
  const api = fakeApi({ putThrows: new ApiError(400, "PUT /agent-config → 400: duplicate matchQuery") });
  const result = await tool("set_fixed_screens", api).handler({ projectId: PROJECT, screens: [screen()] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /duplicate matchQuery/);
});

// --- set_fixed_screens: the schema -----------------------------------------

test("the schema caps the set at 12 entries", () => {
  const schema = inputSchema("set_fixed_screens");
  const set = (count) => ({
    projectId: PROJECT,
    screens: Array.from({ length: count }, (_, index) => screen(index)),
  });
  assert.equal(schema.safeParse(set(12)).success, true, "12 is allowed");
  assert.equal(schema.safeParse(set(13)).success, false, "13 is refused");
});

test("the schema is the home's entry shape: matchQuery, screenId and data are required", () => {
  const schema = inputSchema("set_fixed_screens");
  const parse = (entry) => schema.safeParse({ projectId: PROJECT, screens: [entry] }).success;
  assert.equal(parse(screen()), true);
  assert.equal(parse({ ...screen(), matchQuery: "" }), false, "an empty matchQuery is refused");
  assert.equal(parse({ ...screen(), matchQuery: "q".repeat(201) }), false, "over 200 chars is refused");
  assert.equal(parse({ screenId: "menu-screen", data: {} }), false, "no matchQuery");
  assert.equal(parse({ matchQuery: "show the menu", data: {} }), false, "no screenId");
  assert.equal(parse({ matchQuery: "show the menu", screenId: "menu-screen" }), false, "no data");
  assert.equal(parse({ ...screen(), followUpText: "x".repeat(2001) }), false, "a 2001-char follow-up");
  assert.equal(schema.safeParse({ projectId: "not-a-uuid", screens: [] }).success, false);
});

test("bindings are the HOME's binding schema, one shared object", () => {
  const home = tool("set_home_screen").config.inputSchema.bindings.unwrap();
  const fixed = tool("set_fixed_screens").config.inputSchema.screens.element.shape.bindings.unwrap();
  assert.equal(home, fixed, "the two tools share one binding schema instance");
});

test("both tools accept and refuse exactly the same bindings", () => {
  const homeSchema = inputSchema("set_home_screen");
  const fixedSchema = inputSchema("set_fixed_screens");
  const cases = [
    [true, [{ path: "grid.items", entityName: "dishes" }]],
    [true, [{ path: "grid.items", entityName: "dishes", filters: [{ field: "price", op: "lt", value: 50 }], sort: { field: "price", dir: "asc" }, limit: 50 }]],
    [false, [{ path: "grid.items", entityName: "dishes", limit: 51 }]],
    [false, [{ path: "items", entityName: "dishes" }]],
    [false, [{ path: "grid.items", entityName: "Dishes" }]],
    [false, [{ path: "grid.items", entityName: "dishes", filters: [{ field: "price", op: "lt", value: { amount: 50 } }] }]],
    [false, [{ path: "grid.items", entityName: "dishes", sort: { field: "price", dir: "up" } }]],
    [false, [0, 1, 2, 3].map(() => ({ path: "grid.items", entityName: "dishes" }))],
  ];
  for (const [expected, bindings] of cases) {
    const label = JSON.stringify(bindings);
    assert.equal(
      homeSchema.safeParse({ projectId: PROJECT, matchQuery: "home", screenId: "s", data: {}, bindings }).success,
      expected,
      `home disagrees on ${label}`
    );
    assert.equal(
      fixedSchema.safeParse({ projectId: PROJECT, screens: [{ ...screen(), bindings }] }).success,
      expected,
      `fixed screens disagree on ${label}`
    );
  }
});

test("more than 4 filters on one binding is refused by both", () => {
  const filters = ["a", "b", "c", "d", "e"].map((field) => ({ field, op: "eq", value: "x" }));
  const bindings = [{ path: "grid.items", entityName: "dishes", filters }];
  assert.equal(
    inputSchema("set_home_screen").safeParse({ projectId: PROJECT, matchQuery: "home", screenId: "s", data: {}, bindings }).success,
    false
  );
  assert.equal(
    inputSchema("set_fixed_screens").safeParse({ projectId: PROJECT, screens: [{ ...screen(), bindings }] }).success,
    false
  );
});

// --- list_fixed_screens ----------------------------------------------------

test("list_fixed_screens READS the config and returns the stored set", async () => {
  const stored = [{ matchQuery: "show the menu", screenId: "menu-screen", data: {} }];
  const api = fakeApi({ config: { fixedScreens: stored } });
  const result = await tool("list_fixed_screens", api).handler({ projectId: PROJECT });
  assert.deepEqual(api.calls.get, [CONFIG_PATH]);
  assert.deepEqual(api.calls.put, [], "a read never writes");
  assert.deepEqual(
    result.structuredContent,
    { fixedScreens: stored },
    "listing what is stored carries no verification: only verify_canned_screens proves rows"
  );
});

test("list_fixed_screens answers an empty set for a project with no config and for one with none stored", async () => {
  for (const config of [null, {}, { homeScreen: { matchQuery: "home" } }, { fixedScreens: null }]) {
    const api = { get: async () => config };
    const result = await tool("list_fixed_screens", api).handler({ projectId: PROJECT });
    assert.deepEqual(result.structuredContent, { fixedScreens: [] });
  }
});

// --- registration ----------------------------------------------------------

test("both tools are guarded like set_home_screen: uuid project, write vs read annotations, output schema", () => {
  const setter = tool("set_fixed_screens").config;
  const lister = tool("list_fixed_screens").config;
  assert.deepEqual(setter.annotations, tool("set_home_screen").config.annotations);
  assert.equal(setter.annotations.readOnlyHint, false);
  assert.equal(setter.annotations.idempotentHint, true);
  assert.equal(setter.annotations.destructiveHint, false);
  assert.equal(lister.annotations.readOnlyHint, true);
  for (const config of [setter, lister]) {
    assert.equal(z.object(config.inputSchema).safeParse({ projectId: "nope", screens: [] }).success, false);
    const verification = { unavailable: true, reason: "no app client" };
    assert.equal(
      z
        .object(config.outputSchema)
        .safeParse({ fixedScreens: [{ matchQuery: "show the menu" }], verification }).success,
      true
    );
    assert.equal(
      z.object(config.outputSchema).safeParse({ fixedScreens: {}, verification }).success,
      false
    );
  }
});

test("a report whose screen carries uncoveredQueries rides through both tools' output schema", () => {
  // The coverage half of the report: the chip queries on a screen that no canned
  // screen answers. Optional on the wire, so an older app that sends none still
  // parses, and a list of anything but strings is refused.
  const screenReport = (extra) => ({
    kind: "fixed",
    matchQuery: "show the menu",
    screenId: "menu-screen",
    ok: true,
    bindings: [],
    ...extra,
  });
  const cases = [
    [true, screenReport({ uncoveredQueries: ["do you deliver?", "where are you"] })],
    [true, screenReport({ uncoveredQueries: [] })],
    [true, screenReport({})],
    [false, screenReport({ uncoveredQueries: "do you deliver?" })],
    [false, screenReport({ uncoveredQueries: [7] })],
  ];
  for (const [expected, report] of cases) {
    const verification = { ok: true, screens: [report], summary: [] };
    for (const name of ["set_fixed_screens", "set_home_screen"]) {
      assert.equal(
        z
          .object(tool(name).config.outputSchema)
          .safeParse({ fixedScreens: [], homeScreen: {}, verification }).success,
        expected,
        `${name} disagrees on ${JSON.stringify(report.uncoveredQueries)}`
      );
    }
  }
});

test("set_home_screen still stores the home the same way (the shared schema changed nothing)", async () => {
  const api = fakeApi();
  await tool("set_home_screen", api).handler({
    projectId: PROJECT,
    matchQuery: "home",
    screenId: "home-screen",
    data: { hero: { title: "Welcome" } },
    bindings: [{ path: "grid.items", entityName: "dishes", limit: 6 }],
    followUpText: "Welcome.",
  });
  assert.deepEqual(putBody(api), {
    homeScreen: {
      matchQuery: "home",
      screenId: "home-screen",
      data: { hero: { title: "Welcome" } },
      bindings: [{ path: "grid.items", entityName: "dishes", limit: 6 }],
      followUpText: "Welcome.",
    },
  });
});
