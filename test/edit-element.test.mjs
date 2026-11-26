// edit_element, as an AI client sees it: a few search-and-replace edits on the code of an element's
// CURRENT version, the same pre-flight as publish_element_version on the edited code, the next
// version published with every other field carried forward (never over a version another client
// published meanwhile), and the placements pinned to the edited version moved to the new one, one
// screen at a time, each screen read again right before its own PUT. Pins to other versions stay
// and are reported. Any edit that does not match exactly once, or a pre-flight failure, publishes
// nothing and touches no screen. Spring is a stateful fake that records every call.
// Dependency-free (node:test) like its siblings.
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";

import { ApiError } from "../dist/api-client.js";
import { WRITE } from "../dist/tools/helpers.js";
import { registerElementTools } from "../dist/tools/elements.js";
import { isPreviewAppAvailable } from "../dist/preview/app-resource.js";

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";
const ELEMENT = "4f0c6a8e-1d2b-4c3a-9e8f-7a6b5c4d3e2f";
const KEY = "menu-card";
const BASE = `/projects/${PROJECT}`;
const ELEMENT_PATH = `${BASE}/elements/${ELEMENT}`;

const CODE = `import { Box, Typography } from "@mui/material";

export interface Props {
  title: string;
  items: { id: string; name: string }[];
  onSelectItem?: (item: { id: string; name: string }) => void;
}

export default function Component({ title, items, onSelectItem }: Props) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography variant="h6">{title}</Typography>
      {items.map((item) => (
        <Box key={item.id} role="button" tabIndex={0} onClick={() => onSelectItem?.(item)}>
          <Typography>{item.name}</Typography>
        </Box>
      ))}
    </Box>
  );
}
`;

const SKELETON = `import { Box, Skeleton } from "@mui/material";

export default function SkeletonComponent() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Skeleton variant="text" width="40%" />
    </Box>
  );
}
`;

const PROPS_SCHEMA = {
  type: "object",
  properties: { title: { type: "string" }, items: { type: "array", items: { type: "object" } } },
  required: ["title", "items"],
};

/** The current version as Spring's CustomElementVersionResponse serializes it (nulls included). */
const CURRENT = {
  id: "v-3",
  customElementId: ELEMENT,
  version: 3,
  code: CODE,
  codeSha256: "abc",
  previewWrapperCode: "export default function Preview() { return null; }",
  skeletonCode: SKELETON,
  prompt: "Make a menu card",
  propsSchema: PROPS_SCHEMA,
  defaultProps: { title: "Menu", items: [{ id: "1", name: "Soup" }] },
  toolSchema: { name: "generate_custom_menu-card", description: "A menu card", input_schema: PROPS_SCHEMA },
  structurePrompt: "Use for the menu.",
  clickQueryTemplate: "Show {name} (ID: {id})",
  interactionPropName: "onSelectItem",
  rightClickPropName: null,
  clickArgIsObject: true,
  extractionStatus: "succeeded",
  createdAt: "2026-11-20T10:00:00Z",
};

const pin = (id, customElementId, version) => ({
  id,
  elementType: null,
  customElementId,
  version,
  position: { row: 0, column: 0, subRow: 0 },
  size: { width: { md: "100.00%", xs: "100%" }, height: "auto" },
});

const screen = (id, placements) => ({
  id,
  name: id,
  description: `The ${id} screen`,
  config: {
    id,
    name: id,
    selectionConfig: { whenToUse: id, exampleQueries: [], clickedElements: [] },
    layout: { type: "flex", flexDirection: "column" },
    elements: placements,
  },
  elements: placements,
  created: "2026-11-01T00:00:00Z",
  modified: "2026-11-02T00:00:00Z",
  version: 5,
});

/**
 * The base (edited) version is v3 and the edit publishes v4. s-old pins v3; s-mixed pins v1 AND v3;
 * s-older pins v2 only; s-new already pins v4; s-other and s-fixed never use the element.
 */
const SCREENS = [
  screen("s-old", [pin("a", KEY, 3)]),
  screen("s-other", [pin("b", KEY.replace("menu", "other"), 3)]),
  screen("s-mixed", [pin("c", KEY, 1), { id: "t", elementType: "header" }, pin("d", KEY, 3)]),
  screen("s-older", [pin("e", KEY, 2)]),
  screen("s-new", [pin("f", KEY, 4)]),
  screen("s-fixed", [{ id: "t", elementType: "header" }]),
];

/**
 * Spring, with state: appending a version makes it the element's current one, a screen PUT
 * replaces that stored screen. `onElementRead(n, state)` and `onProjectRead(n, state)` run before
 * the n-th read (1-based) answers, so a test can land another client's change between two reads.
 */
function spring({
  current = CURRENT,
  status = "published",
  putFails = new Set(),
  appendAnswer = { version: 4 },
  onElementRead = () => {},
  onProjectRead = () => {},
} = {}) {
  const state = { current: structuredClone(current), screens: structuredClone(SCREENS), elementReads: 0, projectReads: 0 };
  return (method, path, body) => {
    if (method === "GET" && path === ELEMENT_PATH) {
      onElementRead(++state.elementReads, state);
      return {
        id: ELEMENT,
        elementKey: KEY,
        name: "Menu card",
        description: "A menu card",
        currentVersion: state.current.version,
        status,
        currentVersionPayload: state.current,
      };
    }
    if (method === "POST" && path === `${ELEMENT_PATH}/versions`) {
      state.current = { ...state.current, ...body, version: (state.current.version ?? 0) + 1 };
      return appendAnswer;
    }
    if (method === "PATCH" && path === ELEMENT_PATH) return { id: ELEMENT, status: "published" };
    if (method === "GET" && path === BASE) {
      onProjectRead(++state.projectReads, state);
      return { id: PROJECT, brandSettings: { primaryColor: "#123456" }, customScreens: state.screens };
    }
    if (method === "GET" && path === `${BASE}/agent-config`) return { policies: { language: "en" } };
    if (method === "PUT" && path.startsWith(`${BASE}/screens/`)) {
      const id = decodeURIComponent(path.slice(`${BASE}/screens/`.length));
      if (putFails.has(id)) throw new ApiError(409, `PUT ${path} → 409: The project changed, try again`);
      state.screens = state.screens.map((stored) => (stored.id === id ? { ...body, version: stored.version + 1 } : stored));
      return { saved: id, version: 6, totalScreens: state.screens.length };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
}

/** A fake ApiClient that records every call and tracks how many writes run at once. */
function fakeApi(answer) {
  const calls = [];
  let inFlight = 0;
  const state = { calls, maxConcurrentPuts: 0 };
  const verb = (method) => async (path, body) => {
    calls.push({ method, path, body: body === undefined ? undefined : structuredClone(body) });
    if (method === "PUT") {
      inFlight += 1;
      state.maxConcurrentPuts = Math.max(state.maxConcurrentPuts, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    }
    return structuredClone(await answer(method, path, body));
  };
  return Object.assign(state, { get: verb("GET"), post: verb("POST"), patch: verb("PATCH"), put: verb("PUT"), delete: verb("DELETE") });
}

function elementTools(api) {
  const tools = new Map();
  registerElementTools({ registerTool: (name, config, handler) => tools.set(name, { config, handler }) }, api);
  return tools;
}

/** Call a tool the way the SDK does: arguments parsed by its input schema first (defaults applied). */
async function call(api, args) {
  const tool = elementTools(api).get("edit_element");
  return tool.handler(z.object(tool.config.inputSchema).parse(args));
}

const writes = (api) => api.calls.filter((c) => c.method !== "GET");
const EDIT = { search: '<Typography variant="h6">{title}</Typography>', replace: '<Typography variant="h5">{title}</Typography>' };
const EDITED = CODE.replace('variant="h6"', 'variant="h5"');

test("registered beside its siblings as a write, with the edit limits in its input schema", () => {
  const tools = elementTools(fakeApi(spring()));
  const names = [...tools.keys()];
  assert.ok(names.indexOf("edit_element") === names.indexOf("publish_element_version") + 1, names.join(", "));
  const { config } = tools.get("edit_element");
  assert.deepEqual(config.annotations, WRITE);
  assert.deepEqual(Object.keys(config.inputSchema), ["projectId", "elementId", "edits", "repinScreens"]);
  const input = z.object(config.inputSchema);
  const base = { projectId: PROJECT, elementId: ELEMENT };
  assert.equal(input.parse({ ...base, edits: [EDIT] }).repinScreens, true, "repinScreens defaults to true");
  assert.equal(input.safeParse({ ...base, edits: [] }).success, false, "at least one edit");
  assert.equal(input.safeParse({ ...base, edits: Array(21).fill(EDIT) }).success, false, "at most 20 edits");
  assert.equal(input.safeParse({ ...base, edits: Array(20).fill(EDIT) }).success, true);
  assert.equal(input.safeParse({ ...base, edits: [{ search: "x".repeat(20001), replace: "y" }] }).success, false);
  assert.equal(input.safeParse({ ...base, edits: [{ search: "x", replace: "y".repeat(20001) }] }).success, false);
  const description = config.description;
  for (const phrase of [
    "Prefer it over publish_element_version whenever the change is a few lines",
    "copied EXACTLY from the current code",
    "match exactly one place",
    "the whole call is refused",
    "publishes the next version",
    "whatever the element's status",
    "the result is published (a draft element becomes published)",
    "re-pins every screen placement pinned to the version it edited",
    "keeps its pin and is listed in otherPins",
    "the stored skeleton is carried forward as it is, not validated again",
    "When another client publishes this element while the call runs, the call is refused",
  ]) {
    assert.ok(description.includes(phrase), `the description says: ${phrase}`);
  }
  assert.doesNotMatch(description, /—/, "no em dash");
});

test("happy path: publishes the edited code with every other field carried forward and moves only the pins to the edited version", async () => {
  const api = fakeApi(spring());
  const result = await call(api, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT] });
  assert.notEqual(result.isError, true, result.content[0].text);

  const post = api.calls.find((c) => c.method === "POST");
  assert.equal(post.path, `${ELEMENT_PATH}/versions`);
  assert.deepEqual(post.body, {
    code: EDITED,
    previewWrapperCode: CURRENT.previewWrapperCode,
    skeletonCode: CURRENT.skeletonCode,
    prompt: "Edited by the customer's agent via the BranderUX MCP (edit_element, 1 edit).",
    propsSchema: CURRENT.propsSchema,
    defaultProps: CURRENT.defaultProps,
    toolSchema: CURRENT.toolSchema,
    structurePrompt: CURRENT.structurePrompt,
    clickQueryTemplate: CURRENT.clickQueryTemplate,
    interactionPropName: CURRENT.interactionPropName,
    rightClickPropName: null,
    clickArgIsObject: true,
    extractionStatus: "succeeded",
  });

  assert.deepEqual(
    writes(api).map((c) => [c.method, c.path]),
    [
      ["POST", `${ELEMENT_PATH}/versions`],
      ["PATCH", ELEMENT_PATH],
      ["PUT", `${BASE}/screens/s-old`],
      ["PUT", `${BASE}/screens/s-mixed`],
    ]
  );
  assert.deepEqual(api.calls.find((c) => c.method === "PATCH").body, { status: "published" });
  assert.equal(api.maxConcurrentPuts, 1, "screens are re-put one at a time");

  // Each screen goes back byte for byte, only its v3 pins moved to v4 (server-owned fields left out).
  for (const put of writes(api).filter((c) => c.method === "PUT")) {
    const stored = SCREENS.find((s) => put.path.endsWith(`/${s.id}`));
    const { created: _c, modified: _m, version: _v, ...rest } = structuredClone(stored);
    const bump = (list) => list.map((p) => (p.customElementId === KEY && p.version === 3 ? { ...p, version: 4 } : p));
    const expected = { ...rest, elements: bump(rest.elements), config: { ...rest.config, elements: bump(rest.config.elements) } };
    assert.equal(JSON.stringify(put.body), JSON.stringify(expected), put.path);
  }
  const mixed = writes(api).find((c) => c.path.endsWith("/s-mixed")).body;
  assert.deepEqual(
    mixed.elements.filter((p) => p.customElementId === KEY).map((p) => [p.id, p.version]),
    [["c", 1], ["d", 4]],
    "the v1 pin on the same screen keeps its pin"
  );

  const { preview, ...structured } = result.structuredContent;
  assert.deepEqual(structured, {
    elementId: ELEMENT,
    publishedVersion: 4,
    baseVersion: 3,
    appliedEdits: 1,
    repinnedScreens: ["s-old", "s-mixed"],
    otherPins: [
      { screenId: "s-mixed", version: 1 },
      { screenId: "s-older", version: 2 },
    ],
  });
  assert.deepEqual(JSON.parse(result.content[0].text), structured);
  const output = z.object(elementTools(api).get("edit_element").config.outputSchema).strict();
  assert.equal(output.safeParse(result.structuredContent).success, true);
  if (isPreviewAppAvailable()) {
    assert.equal(preview.version, 4);
    assert.equal(preview.name, "Menu card");
    assert.deepEqual(preview.defaultProps, CURRENT.defaultProps);
  }
});

test("each screen is read again right before its own PUT: a save landed since is kept, a screen no longer on the edited version is skipped", async () => {
  const api = fakeApi(
    spring({
      onProjectRead: (n, state) => {
        if (n !== 2) return; // the read right before s-old's PUT
        const edit = (id, change) => (state.screens = state.screens.map((s) => (s.id === id ? change(structuredClone(s)) : s)));
        // The Screen Builder renamed s-old meanwhile, and another tool moved s-mixed's pin to v4 itself.
        edit("s-old", (s) => ({ ...s, name: "Renamed in the Screen Builder" }));
        edit("s-mixed", (s) => {
          const moved = s.elements.map((p) => (p.id === "d" ? { ...p, version: 4 } : p));
          return { ...s, elements: moved, config: { ...s.config, elements: moved } };
        });
      },
    })
  );
  const result = await call(api, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT] });
  assert.notEqual(result.isError, true, result.content[0].text);

  const screenCalls = api.calls.filter((c) => c.path === BASE || c.path.startsWith(`${BASE}/screens/`));
  assert.deepEqual(
    screenCalls.map((c) => [c.method, c.path.replace(`${BASE}/screens/`, "")]),
    [
      ["GET", BASE], // which screens pin v3
      ["GET", BASE], // s-old, read again
      ["PUT", "s-old"],
      ["GET", BASE], // s-mixed, read again: no v3 pin left, so no PUT
      ["GET", BASE], // the panel context
    ]
  );
  const put = writes(api).find((c) => c.method === "PUT");
  assert.equal(put.body.name, "Renamed in the Screen Builder", "the PUT carries the fresh copy, not the first read");
  assert.equal(put.body.elements[0].version, 4);
  assert.deepEqual(result.structuredContent.repinnedScreens, ["s-old"]);
  assert.deepEqual(result.structuredContent.otherPins, [
    { screenId: "s-mixed", version: 1 },
    { screenId: "s-older", version: 2 },
  ]);
});

test("a screen that cannot be read again is left alone and reported; the others are still re-pinned", async () => {
  const api = fakeApi(
    spring({
      onProjectRead: (n) => {
        if (n === 2) throw new ApiError(503, "GET /projects → 503: Service unavailable");
      },
    })
  );
  const result = await call(api, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT] });
  assert.notEqual(result.isError, true, result.content[0].text);
  assert.deepEqual(result.structuredContent.repinnedScreens, ["s-mixed"]);
  assert.equal(result.structuredContent.repinFailures.length, 1);
  assert.equal(result.structuredContent.repinFailures[0].screenId, "s-old");
  assert.match(result.structuredContent.repinFailures[0].error, /read this screen again right before re-pinning it, so it was left alone/);
  assert.match(result.structuredContent.repinFailures[0].error, /503/);
});

test("another client publishing between the read and the publish refuses the call: nothing is written", async () => {
  const api = fakeApi(
    spring({
      onElementRead: (n, state) => {
        if (n === 2) state.current = { ...state.current, version: 4, code: CODE.replace("gap: 1", "gap: 2") };
      },
    })
  );
  const result = await call(api, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT] });
  assert.equal(result.isError, true);
  const text = result.content[0].text;
  assert.match(text, /the edits were applied to v3 of element/);
  assert.match(text, /its current version is now v4: another client published it while this call ran/);
  assert.match(text, /Nothing was published and no screen was touched/);
  assert.match(text, /get_element and call edit_element again, with every search copied from that code/);
  assert.doesNotMatch(text, /—/, "no em dash");
  assert.deepEqual(writes(api), []);
  assert.deepEqual(
    api.calls.map((c) => [c.method, c.path]),
    [
      ["GET", ELEMENT_PATH],
      ["GET", ELEMENT_PATH],
    ],
    "the version is read again right before the publish"
  );
});

test("an element whose current version number cannot be read is refused before anything is written", async () => {
  const { version: _v, ...versionless } = CURRENT;
  const api = fakeApi(
    (method, path) =>
      method === "GET" && path === ELEMENT_PATH
        ? { id: ELEMENT, elementKey: KEY, status: "published", currentVersionPayload: versionless }
        : spring()(method, path)
  );
  const result = await call(api, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /version number of element .* could not be read/);
  assert.deepEqual(writes(api), []);
});

test("a draft element is edited and published, exactly like publish_element_version", async () => {
  const api = fakeApi(spring({ status: "draft" }));
  const result = await call(api, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT] });
  assert.notEqual(result.isError, true, result.content[0].text);
  assert.deepEqual(
    writes(api)
      .slice(0, 2)
      .map((c) => [c.method, c.path, c.body?.code === undefined ? c.body : "code"]),
    [
      ["POST", `${ELEMENT_PATH}/versions`, "code"],
      ["PATCH", ELEMENT_PATH, { status: "published" }],
    ]
  );
  assert.equal(result.structuredContent.publishedVersion, 4);
  assert.equal(result.structuredContent.baseVersion, 3);
});

test("a stored skeleton that today's validator would refuse is carried forward, never a reason to refuse the edit", async () => {
  const oldSkeleton = SKELETON.replace("export default function SkeletonComponent()", "export default function Loading()").replace(
    'import { Box, Skeleton } from "@mui/material";',
    'import { Box, Skeleton } from "@mui/material";\nimport chunk from "lodash/chunk";'
  );
  const api = fakeApi(spring({ current: { ...CURRENT, skeletonCode: oldSkeleton } }));
  const result = await call(api, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT] });
  assert.notEqual(result.isError, true, result.content[0].text);
  const post = api.calls.find((c) => c.method === "POST");
  assert.equal(post.body.skeletonCode, oldSkeleton, "the stored skeleton is sent as it was");
  assert.equal(post.body.code, EDITED);
});

test("an indent-tolerant edit and several edits in order publish one version", async () => {
  const api = fakeApi(spring());
  const result = await call(api, {
    projectId: PROJECT,
    elementId: ELEMENT,
    edits: [
      { search: '<Typography variant="h6">{title}</Typography>\n{items.map((item) => (', replace: '<Typography variant="h5">{title}</Typography>\n{items.map((item) => (' },
      { search: "<Typography>{item.name}</Typography>", replace: '<Typography color="text.secondary">{item.name}</Typography>' },
    ],
  });
  assert.notEqual(result.isError, true, result.content[0].text);
  assert.equal(result.structuredContent.appliedEdits, 2);
  const post = api.calls.find((c) => c.method === "POST");
  assert.equal(
    post.body.code,
    EDITED.replace("<Typography>{item.name}</Typography>", '<Typography color="text.secondary">{item.name}</Typography>')
  );
  assert.equal(post.body.prompt, "Edited by the customer's agent via the BranderUX MCP (edit_element, 2 edits).");
});

test("a failed edit publishes nothing, touches no screen and names each failed edit", async () => {
  const api = fakeApi(spring());
  const result = await call(api, {
    projectId: PROJECT,
    elementId: ELEMENT,
    edits: [EDIT, { search: "<Typography", replace: "<Text" }, { search: "not in the code", replace: "x" }],
  });
  assert.equal(result.isError, true);
  const text = result.content[0].text;
  assert.match(text, /nothing was changed, no version was published and no screen was touched/);
  assert.match(text, /- Edit 2 of 3 \(ambiguous\): search matches 2 places/);
  assert.match(text, /- Edit 3 of 3 \(not_found\): Line 1 of search is not in the code/);
  assert.doesNotMatch(text, /Edit 1 of 3/);
  assert.deepEqual(writes(api), []);
  assert.deepEqual(api.calls.map((c) => [c.method, c.path]), [["GET", ELEMENT_PATH]]);
});

test("a pre-flight failure after a successful edit publishes nothing and reports the validation messages", async () => {
  const api = fakeApi(spring());
  const result = await call(api, {
    projectId: PROJECT,
    elementId: ELEMENT,
    edits: [
      { search: 'import { Box, Typography } from "@mui/material";', replace: 'import { Box, Typography } from "@mui/material";\nimport chunk from "lodash/chunk";' },
      { search: "export default function Component(", replace: "export default function MenuCard(" },
    ],
  });
  assert.equal(result.isError, true);
  const text = result.content[0].text;
  assert.match(text, /rejected by pre-flight validation, so nothing was published and no screen was touched/);
  assert.match(text, /Import 'lodash\/chunk' is not in the sandbox allowlist/);
  assert.match(text, /export default function Component/);
  assert.match(text, /goes through publish_element_version/);
  assert.deepEqual(writes(api), []);
});

test("the carried-forward wiring is checked against the edited code", async () => {
  const api = fakeApi(spring());
  const result = await call(api, {
    projectId: PROJECT,
    elementId: ELEMENT,
    edits: [
      { search: "onSelectItem?: (item", replace: "onAddItem?: (item" },
      { search: "{ title, items, onSelectItem }", replace: "{ title, items, onAddItem }" },
      { search: "onClick={() => onSelectItem?.(item)}", replace: "onClick={() => onAddItem?.(item)}" },
    ],
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /interactionPropName "onSelectItem"/);
  assert.deepEqual(writes(api), []);
});

test("repinScreens: false publishes and leaves every screen alone", async () => {
  const api = fakeApi(spring());
  const result = await call(api, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT], repinScreens: false });
  assert.notEqual(result.isError, true, result.content[0].text);
  assert.deepEqual(
    writes(api).map((c) => c.method),
    ["POST", "PATCH"]
  );
  assert.deepEqual(result.structuredContent.repinnedScreens, []);
  assert.equal("repinFailures" in result.structuredContent, false);
  assert.equal("otherPins" in result.structuredContent, false);
  assert.equal(result.structuredContent.baseVersion, 3);
});

test("a screen that fails to re-pin is reported, and the others are still re-pinned", async () => {
  const api = fakeApi(spring({ putFails: new Set(["s-old"]) }));
  const result = await call(api, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT] });
  assert.notEqual(result.isError, true, result.content[0].text);
  assert.deepEqual(result.structuredContent.repinnedScreens, ["s-mixed"]);
  assert.equal(result.structuredContent.repinFailures.length, 1);
  assert.equal(result.structuredContent.repinFailures[0].screenId, "s-old");
  assert.match(result.structuredContent.repinFailures[0].error, /409: The project changed, try again/);
  const output = z.object(elementTools(api).get("edit_element").config.outputSchema).strict();
  assert.equal(output.safeParse(result.structuredContent).success, true);
});

test("a tool-disabled element stays tool-disabled, and a right-click prop the edit adds is detected", async () => {
  const api = fakeApi(spring({ current: { ...CURRENT, toolSchema: null } }));
  const result = await call(api, {
    projectId: PROJECT,
    elementId: ELEMENT,
    edits: [
      {
        search: "  onSelectItem?: (item: { id: string; name: string }) => void;\n}",
        replace: "  onSelectItem?: (item: { id: string; name: string }) => void;\n  onItemContextMenu?: (item: { id: string; name: string }) => void;\n}",
      },
    ],
  });
  assert.notEqual(result.isError, true, result.content[0].text);
  const post = api.calls.find((c) => c.method === "POST");
  assert.equal(post.body.toolSchema, null);
  assert.equal(post.body.rightClickPropName, "onItemContextMenu");
});

test("edits that leave the code as it was publish nothing", async () => {
  const api = fakeApi(spring());
  const result = await call(api, {
    projectId: PROJECT,
    elementId: ELEMENT,
    edits: [EDIT, { search: 'variant="h5"', replace: 'variant="h6"' }],
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /nothing to publish/);
  assert.deepEqual(writes(api), []);
});

test("an element without code, or a missing element, is refused before anything is written", async () => {
  const empty = fakeApi(spring({ current: { ...CURRENT, code: "" } }));
  const result = await call(empty, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT] });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /has no version code to edit/);
  assert.deepEqual(writes(empty), []);

  const missing = fakeApi((method, path) => (method === "GET" && path === ELEMENT_PATH ? null : spring()(method, path)));
  const gone = await call(missing, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT] });
  assert.equal(gone.isError, true);
  assert.match(gone.content[0].text, /not found/);
});

test("a publish answer without a version number falls back to the element's current version", async () => {
  const api = fakeApi(spring({ appendAnswer: null }));
  const result = await call(api, { projectId: PROJECT, elementId: ELEMENT, edits: [EDIT] });
  assert.notEqual(result.isError, true, result.content[0].text);
  assert.equal(result.structuredContent.publishedVersion, 4);
  assert.deepEqual(result.structuredContent.repinnedScreens, ["s-old", "s-mixed"]);
});
