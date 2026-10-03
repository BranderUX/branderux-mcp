// A stored screen renders { ...placement.defaultProps, ...data[placement.id] }
// on every replay (the designed home, a fixed screen, a deterministic answer),
// and a placement with no data renders from its defaultProps alone. Samples on
// a PLACEMENT therefore reach real visitors; an ELEMENT's own defaultProps are
// preview data no live answer reads. put_screen names any placement that
// carries defaultProps, and the docs and tool descriptions say where samples
// belong. Dependency-free (node:test) like its siblings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { placementDefaults, placementDefaultsNote } = await import(
  "../dist/lib/placement-defaults.js"
);
const { registerScreenTools } = await import("../dist/tools/screens.js");
const { registerElementTools } = await import("../dist/tools/elements.js");

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";

const placement = (id, extra = {}) => ({
  id,
  elementType: null,
  customElementId: "inquiry-form",
  version: 3,
  position: { row: 0, column: 0, subRow: 0 },
  size: { width: { md: "100.00%", xs: "100%" } },
  ...extra,
});

/** A fake ApiClient that saves screens. */
function fakeApi() {
  const calls = { put: [] };
  return {
    calls,
    get: async () => ({ customScreens: [] }),
    put: async (path, body) => {
      calls.put.push({ path, body });
      return { saved: body.id, version: 2, totalScreens: 4 };
    },
  };
}

function tool(register, name, api) {
  const tools = new Map();
  register({ registerTool: (toolName, config, fn) => tools.set(toolName, { config, fn }) }, api);
  const found = tools.get(name);
  assert.ok(found, `${name} is registered`);
  return found;
}

test("finds the placements that carry a non-empty defaultProps object, with its keys", () => {
  assert.deepEqual(
    placementDefaults([
      placement("form", { defaultProps: { initialValues: { matter: "Patent filing" }, title: "Ask us" } }),
      placement("empty", { defaultProps: {} }),
      placement("none"),
      placement("array", { defaultProps: ["not", "an", "object"] }),
      { defaultProps: { headline: "Hi" } },
      null,
    ]),
    [
      { placementId: "form", keys: ["initialValues", "title"] },
      { placementId: "(no id)", keys: ["headline"] },
    ]
  );
});

test("the note names the placement and its keys and says why it matters", () => {
  const note = placementDefaultsNote({ placementId: "form", keys: ["initialValues", "title"] });
  assert.match(note, /Placement "form" carries defaultProps \(initialValues, title\)/);
  assert.match(note, /reach visitors/);
  assert.match(note, /only previews read/);
});

test("put_screen notes a placement with defaultProps in its text and its structured result", async () => {
  const api = fakeApi();
  const { fn } = tool(registerScreenTools, "put_screen", api);
  const result = await fn({
    projectId: PROJECT,
    screen: {
      id: "custom-inquiry",
      name: "Inquiry",
      config: {},
      elements: [placement("form", { defaultProps: { initialValues: { matter: "Patent filing" } } })],
    },
  });
  assert.equal(api.calls.put.length, 1, "the screen is still saved, as sent");
  assert.deepEqual(api.calls.put[0].body.elements[0].defaultProps, {
    initialValues: { matter: "Patent filing" },
  });
  assert.equal(result.structuredContent.notes.length, 1);
  assert.match(result.structuredContent.notes[0], /Placement "form" carries defaultProps \(initialValues\)/);
  assert.match(result.content[0].text, /Placement "form" carries defaultProps/);
});

test("put_screen adds no notes for placements without defaultProps", async () => {
  const { fn } = tool(registerScreenTools, "put_screen", fakeApi());
  const result = await fn({
    projectId: PROJECT,
    screen: { id: "custom-inquiry", name: "Inquiry", config: {}, elements: [placement("form")] },
  });
  assert.equal(result.structuredContent.notes, undefined);
  assert.doesNotMatch(result.content[0].text, /carries defaultProps/);
});

test("the docs and the tools say samples belong only in the element's own defaultProps", () => {
  const screensDoc = readFileSync(new URL("../src/docs/screens-wire-format.md", import.meta.url), "utf8");
  const contract = readFileSync(new URL("../src/docs/custom-elements-contract.md", import.meta.url), "utf8");
  assert.match(screensDoc, /Placements carry NO `defaultProps`/);
  assert.match(contract, /Those `defaultProps` are preview data/);
  assert.match(contract, /Never copy them onto a screen\nplacement/);

  const { config } = tool(registerScreenTools, "put_screen", fakeApi());
  assert.match(config.description, /placements carry no defaultProps/);

  for (const name of ["create_element", "publish_element_version"]) {
    const { config: elementConfig } = tool(registerElementTools, name, fakeApi());
    const description = elementConfig.inputSchema.defaultProps.description;
    assert.match(description, /PREVIEW ONLY/, `${name}'s defaultProps say they are preview data`);
    assert.match(description, /Never copy them onto a screen placement/);
  }
});
