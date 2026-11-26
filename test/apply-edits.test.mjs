// The search-and-replace edits behind edit_element, a port of the web app's Vibe Studio
// algorithm (exact match first, an indent-tolerant line-wise fallback, more than one match
// refused, a CRLF file kept CRLF), plus the screen re-pin that moves only the placements pinned to
// the edited version, touches nothing else and reports the other pins. Dependency-free
// (node:test) like its siblings.
import assert from "node:assert/strict";
import { test } from "node:test";

import { applyEdits } from "../dist/lib/apply-edits.js";
import { otherPinsIn, pinsVersion, repinScreen, screenPinsVersion } from "../dist/lib/screen-repin.js";

const CODE = [
  'import { Box, Typography } from "@mui/material";',
  "",
  "export default function Component({ title, items }: Props) {",
  "  return (",
  '    <Box sx={{ display: "flex", gap: 1 }}>',
  '      <Typography variant="h6">{title}</Typography>',
  "      {items.map((item) => (",
  '        <Typography key={item.id} color="text.secondary">{item.name}</Typography>',
  "      ))}",
  "    </Box>",
  "  );",
  "}",
].join("\n");

test("an exact search that matches once is replaced, and the rest of the code is untouched", () => {
  const result = applyEdits(CODE, [{ search: 'variant="h6"', replace: 'variant="h5"' }]);
  assert.equal(result.ok, true);
  assert.equal(result.applied, 1);
  assert.equal(result.code, CODE.replace('variant="h6"', 'variant="h5"'));
});

test("a block quoted with a different but consistent indentation matches, and the replacement is re-indented", () => {
  const search = ['<Typography variant="h6">{title}</Typography>', "{items.map((item) => ("].join("\n");
  const replace = ['<Typography variant="h5">{title}</Typography>', "{items.slice(0, 3).map((item) => ("].join("\n");
  const result = applyEdits(CODE, [{ search, replace }]);
  assert.equal(result.ok, true);
  assert.equal(
    result.code,
    CODE.replace(
      '      <Typography variant="h6">{title}</Typography>\n      {items.map((item) => (',
      '      <Typography variant="h5">{title}</Typography>\n      {items.slice(0, 3).map((item) => ('
    )
  );
});

test("a negative indent offset removes the same indentation from the replacement", () => {
  const code = "function a() {\n  if (x) {\n    run();\n  }\n}";
  const search = "      if (x) {\n        run();\n      }";
  const replace = "      if (y) {\n        run();\n      }";
  const result = applyEdits(code, [{ search, replace }]);
  assert.equal(result.ok, true);
  assert.equal(result.code, "function a() {\n  if (y) {\n    run();\n  }\n}");
});

test("trailing whitespace in the code does not stop a match", () => {
  const code = "const a = 1;   \nconst b = 2;\t\nconst c = 3;";
  const result = applyEdits(code, [{ search: "const a = 1;\nconst b = 2;", replace: "const a = 10;\nconst b = 20;" }]);
  assert.equal(result.ok, true);
  assert.equal(result.code, "const a = 10;\nconst b = 20;\nconst c = 3;");
});

test("lines that drift by different indentation are not the same code", () => {
  const search = ['      <Typography variant="h6">{title}</Typography>', "  {items.map((item) => ("].join("\n");
  const result = applyEdits(CODE, [{ search, replace: "x" }]);
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].reason, "not_found");
  assert.match(result.failures[0].hint, /Every line of search is in the code, but not together/);
});

test("not found names the missing line and the closest line of the code", () => {
  const result = applyEdits(CODE, [{ search: '<Typography variant="h4">{title}</Typography>', replace: "x" }]);
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.failures.map((failure) => [failure.index, failure.reason]),
    [[0, "not_found"]]
  );
  const hint = result.failures[0].hint;
  assert.match(hint, /Line 1 of search is not in the code: "<Typography variant="h4">\{title\}<\/Typography>"/);
  assert.match(hint, /The closest line in the code is line 6: "<Typography variant="h6">\{title\}<\/Typography>"/);
  assert.match(hint, /get_element shows it/);
});

test("not found with nothing close says so without a closest line", () => {
  const result = applyEdits(CODE, [{ search: "zzzz qqqq", replace: "x" }]);
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.failures[0].hint, /closest line/);
});

test("an exact search found twice is refused as ambiguous, naming the lines", () => {
  const result = applyEdits(CODE, [{ search: "<Typography", replace: "<Text" }]);
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].reason, "ambiguous");
  assert.match(result.failures[0].hint, /matches 2 places \(lines 6, 8\)/);
  assert.match(result.failures[0].hint, /Include more of the surrounding lines/);
});

test("overlapping exact matches count as two places, as the app counts them", () => {
  const result = applyEdits("aaa", [{ search: "aa", replace: "b" }]);
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].reason, "ambiguous");
});

test("the same block at two indentations is ambiguous on the indent-tolerant pass too", () => {
  const code = "if (a) {\n  go();\n}\nfunction f() {\n    if (a) {\n      go();\n    }\n}";
  const result = applyEdits(code, [{ search: " if (a) {\n   go();\n }", replace: "x" }]);
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].reason, "ambiguous");
  assert.match(result.failures[0].hint, /lines 1, 5/);
});

test("many matches are reported as five or more", () => {
  const result = applyEdits("x;\n".repeat(8), [{ search: "x;", replace: "y;" }]);
  assert.equal(result.ok, false);
  assert.match(result.failures[0].hint, /matches 5 or more places/);
});

test("edits apply in order, each on the code the ones before it leave", () => {
  const forward = applyEdits(CODE, [
    { search: 'variant="h6"', replace: 'variant="h5" id="title"' },
    { search: 'id="title"', replace: 'id="heading"' },
  ]);
  assert.equal(forward.ok, true);
  assert.equal(forward.applied, 2);
  assert.match(forward.code, /<Typography variant="h5" id="heading">/);

  const reversed = applyEdits(CODE, [
    { search: 'id="title"', replace: 'id="heading"' },
    { search: 'variant="h6"', replace: 'variant="h5" id="title"' },
  ]);
  assert.equal(reversed.ok, false);
  assert.deepEqual(
    reversed.failures.map((failure) => [failure.index, failure.reason]),
    [[0, "not_found"]]
  );
});

test("a later failure says the edits before it ran first", () => {
  const result = applyEdits(CODE, [
    { search: 'variant="h6"', replace: 'variant="h5"' },
    { search: 'variant="h6"', replace: 'variant="h4"' },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].index, 1);
  assert.match(result.failures[0].hint, /The edits before it in this call run first/);
});

test("an edit whose replacement equals its search is refused as no change", () => {
  const result = applyEdits(CODE, [{ search: 'variant="h6"', replace: 'variant="h6"' }]);
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].reason, "no_change");
});

test("an empty or blank search is refused, never prepended", () => {
  for (const search of ["", "   \n  "]) {
    const result = applyEdits(CODE, [{ search, replace: "import x from 'y';" }]);
    assert.equal(result.ok, false);
    assert.equal(result.failures[0].reason, "empty_search");
  }
});

test("every failing edit is reported in one call, and none of the code comes back", () => {
  const result = applyEdits(CODE, [
    { search: 'variant="h6"', replace: 'variant="h5"' },
    { search: "missing line", replace: "x" },
    { search: "<Typography", replace: "<Text" },
    { search: "", replace: "x" },
    { search: "gap: 1", replace: "gap: 1" },
  ]);
  assert.equal(result.ok, false);
  assert.equal("code" in result, false);
  assert.deepEqual(
    result.failures.map((failure) => [failure.index, failure.reason]),
    [
      [1, "not_found"],
      [2, "ambiguous"],
      [3, "empty_search"],
      [4, "no_change"],
    ]
  );
});

const KEY = "menu-card";
const pin = (id, version, extra = {}) => ({
  id,
  elementType: null,
  customElementId: KEY,
  version,
  position: { row: 0, column: 0, subRow: 0 },
  size: { width: { md: "100.00%", xs: "100%" }, height: "auto" },
  ...extra,
});

test("pinsVersion: only a placement of this element pinned to exactly that version", () => {
  assert.equal(pinsVersion(pin("a", 3), KEY, 3), true);
  assert.equal(pinsVersion(pin("a", 2), KEY, 3), false, "an older pin is not the edited version");
  assert.equal(pinsVersion(pin("a", 4), KEY, 3), false);
  assert.equal(pinsVersion({ ...pin("a", 3), customElementId: "other" }, KEY, 3), false);
  assert.equal(pinsVersion({ ...pin("a", 3), version: null }, KEY, 3), false);
  assert.equal(pinsVersion({ ...pin("a", 3), version: "3" }, KEY, 3), false);
  assert.equal(pinsVersion({ ...pin("a", 3), elementType: "header" }, KEY, 3), false);
  assert.equal(pinsVersion(null, KEY, 3), false);
});

test("screenPinsVersion looks in elements and in config.elements", () => {
  assert.equal(screenPinsVersion({ id: "a", elements: [pin("x", 3)] }, KEY, 3), true);
  assert.equal(screenPinsVersion({ id: "a", config: { elements: [pin("x", 3)] } }, KEY, 3), true);
  assert.equal(screenPinsVersion({ id: "a", elements: [pin("x", 2)], config: { elements: [pin("x", 2)] } }, KEY, 3), false);
  assert.equal(screenPinsVersion({ id: "a" }, KEY, 3), false);
});

test("repinScreen moves only the pins to the edited version, in elements and config.elements, key order kept", () => {
  const placements = () => [
    pin("hero", 3),
    { id: "title", elementType: "header" },
    pin("kept", 1),
    pin("other", 3, { customElementId: "other" }),
  ];
  const screen = {
    id: "custom-home",
    name: "Home",
    description: "The home",
    config: {
      id: "custom-home",
      selectionConfig: { whenToUse: "Home", exampleQueries: ["Show home"], clickedElements: [] },
      layout: { type: "flex", gap: { xs: 2 } },
      elements: placements(),
    },
    elements: placements(),
    created: "2026-11-01T00:00:00Z",
    modified: "2026-11-02T00:00:00Z",
    version: 7,
  };
  const before = structuredClone(screen);
  const wire = repinScreen(screen, KEY, 3, 4);
  assert.deepEqual(screen, before, "the stored screen object is not mutated");

  const { created: _c, modified: _m, version: _v, ...rest } = before;
  const expected = structuredClone(rest);
  expected.elements[0].version = 4;
  expected.config.elements[0].version = 4;
  assert.equal(JSON.stringify(wire), JSON.stringify(expected));
  assert.equal(wire.elements[2].version, 1, "a pin to another, older version keeps its pin");
});

test("repinScreen returns null for a screen with no pin to the edited version, older pins included", () => {
  const screens = [
    { id: "a", elements: [pin("hero", 4)], config: { elements: [pin("hero", 4)] } },
    { id: "b", elements: [pin("x", 3, { customElementId: "other" })] },
    { id: "c", elements: [{ id: "title", elementType: "header" }] },
    { id: "d", config: { layout: {} } },
    { id: "e", elements: [pin("hero", 1), pin("hero", 2)], config: { elements: [pin("hero", 1), pin("hero", 2)] } },
  ];
  for (const screen of screens) assert.equal(repinScreen(screen, KEY, 3, 4), null, screen.id);
});

test("repinScreen leaves a config without elements as it was", () => {
  const wire = repinScreen({ id: "a", elements: [pin("hero", 1)], config: { layout: { type: "flex" } } }, KEY, 1, 2);
  assert.deepEqual(wire, { id: "a", elements: [pin("hero", 2)], config: { layout: { type: "flex" } } });
});

test("otherPinsIn lists each screen's pins to neither the edited nor the published version, once per version", () => {
  const both = (list) => ({ elements: list, config: { elements: structuredClone(list) } });
  const screens = [
    { id: "s1", ...both([pin("a", 3), pin("b", 2), pin("c", 1), pin("d", 2)]) },
    { id: "s2", ...both([pin("a", 4)]) },
    { id: "s3", ...both([pin("a", 1, { customElementId: "other" }), { id: "t", elementType: "header" }]) },
    { id: "s4", elements: [pin("a", 5)] },
    { id: "s5", config: { elements: [pin("a", 2), { ...pin("b", 1), version: null }] } },
  ];
  assert.deepEqual(otherPinsIn(screens, KEY, 3, 4), [
    { screenId: "s1", version: 1 },
    { screenId: "s1", version: 2 },
    { screenId: "s4", version: 5 },
    { screenId: "s5", version: 2 },
  ]);
  assert.deepEqual(otherPinsIn([], KEY, 3, 4), []);
});

const crlf = (lines) => lines.join("\r\n");
const bareLf = /(^|[^\r])\n/;

test("a CRLF file edited through the indent-tolerant path keeps CRLF on every line", () => {
  const code = crlf(["function a() {", "  if (x) {", "    run();", "  }", "  done();", "}", ""]);
  // Quoted with LF and a different (consistent) indentation: only the tolerant pass can match it.
  const result = applyEdits(code, [{ search: "if (x) {\n  run();\n}", replace: "if (y) {\n  run();\n  again();\n}" }]);
  assert.equal(result.ok, true);
  assert.equal(result.code, crlf(["function a() {", "  if (y) {", "    run();", "    again();", "  }", "  done();", "}", ""]));
  assert.doesNotMatch(result.code, bareLf, "no line lost its \\r");
});

test("a CRLF file matches a search quoted with CRLF or LF alike, and a CRLF replacement adds no doubled \\r", () => {
  const code = crlf(["const a = 1;", "const b = 2;", "const c = 3;"]);
  for (const search of [crlf(["const a = 1;", "const b = 2;"]), "const a = 1;\nconst b = 2;"]) {
    const result = applyEdits(code, [{ search, replace: crlf(["const a = 10;", "const b = 20;"]) }]);
    assert.equal(result.ok, true, JSON.stringify(search));
    assert.equal(result.code, crlf(["const a = 10;", "const b = 20;", "const c = 3;"]));
  }
});

test("a mixed-endings file is matched as it is, and the tolerant pass keeps the last matched line's \\r", () => {
  const code = "a();\r\n  b();\r\nc();\n";
  const result = applyEdits(code, [{ search: "    b();", replace: "    bb();" }]);
  assert.equal(result.ok, true);
  assert.equal(result.code, "a();\r\n  bb();\r\nc();\n");
});
