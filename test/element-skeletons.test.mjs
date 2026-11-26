// The element skeletons doc (navigation, intake form, receipt) and the build knowledge that rides
// beside it: the custom-elements contract's phone traps, the hosted contract's site-data rule,
// persona and skills, and the phone check after publishing. Every skeleton is compiled with the
// REAL publish pre-flight and its wiring checked with the real derivation, so a doc example can
// never hand a client AI code that create_element would reject. Dependency-free (node:test) like
// its siblings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { deriveInteraction } from "../dist/lib/element-actions.js";
import { loadDocs } from "../dist/tools/knowledge.js";
import { checkInteractionWiring, validateElementCode } from "../dist/tools/elements.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

const SKELETONS = read("src/docs/element-skeletons.md");
const ELEMENTS = read("src/docs/custom-elements-contract.md");
const HOSTED = read("src/docs/hosted-agent-contract.md");
const DESIGN = read("src/docs/hosted-design-bar.md");

/** One "## …" section of a doc, up to the next one. */
function section(doc, heading) {
  const start = doc.indexOf(heading);
  assert.notEqual(start, -1, `the doc is missing "${heading}"`);
  const rest = doc.slice(start);
  const end = rest.indexOf("\n## ", 1);
  return rest.slice(0, end === -1 ? undefined : end);
}

/** The three skeletons in doc order, each with its create_element fields. */
function skeletons() {
  const code = [...SKELETONS.matchAll(/```tsx\n([\s\S]*?)```/g)].map((match) => match[1]);
  const fields = [...SKELETONS.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]));
  assert.equal(code.length, 3, "three tsx fences");
  assert.equal(fields.length, 3, "three json fences");
  return ["navigation", "form", "receipt"].map((name, i) => ({ name, code: code[i], fields: fields[i] }));
}

/** The body of `export interface Props { … }`. */
function propsBody(code) {
  const match = code.match(/export interface Props \{([\s\S]*?)\n\}/);
  assert.ok(match, "the code declares Props");
  return match[1];
}

const TRAPS = section(ELEMENTS, "## Traps that only show on a phone");
const SITE_DATA = section(HOSTED, "## Data from the business's own site");
const PERSONA = section(HOSTED, "## Persona and skills that work");
const PHONE_CHECK = section(HOSTED, "## Verify on a phone, after publishing");

test("element-skeletons.md is served by read_doc under its name", () => {
  assert.equal(loadDocs().get("element-skeletons"), SKELETONS);
});

test("every skeleton passes the REAL publish pre-flight and its wiring", () => {
  for (const { name, code, fields } of skeletons()) {
    assert.deepEqual(validateElementCode(code, "component"), [], `${name} compiles under the pre-flight`);
    assert.deepEqual(
      checkInteractionWiring({
        code,
        propsSchema: fields.propsSchema,
        clickQueryTemplate: fields.clickQueryTemplate,
        interactionPropName: fields.interactionPropName,
      }),
      [],
      `${name} wiring`
    );
    const derived = deriveInteraction(code, fields.propsSchema);
    assert.equal(derived.actionProp, fields.interactionPropName, `${name}: the declared primary is the derived one`);
    assert.deepEqual(derived.extraActionProps, [], `${name}: one action, nothing else`);
    for (const key of ["propsSchema", "defaultProps", "structurePrompt", "clickQueryTemplate", "interactionPropName"]) {
      assert.ok(key in fields, `${name} gives ${key}`);
    }
  }
});

test("navigation and receipt send the chip's query and nothing else; the form names EVERY field", () => {
  const [navigation, form, receipt] = skeletons();
  assert.equal(navigation.fields.clickQueryTemplate, "{query}");
  assert.equal(navigation.fields.interactionPropName, "onAsk");
  assert.equal(receipt.fields.clickQueryTemplate, "{query}");
  assert.equal(receipt.fields.interactionPropName, "onAsk");
  assert.equal(form.fields.interactionPropName, "onSubmit");
  const payload = form.code.match(/type Payload = \{([^}]*)\}/);
  assert.ok(payload, "the form declares its payload");
  const names = [...payload[1].matchAll(/(\w+):/g)].map((match) => match[1]);
  assert.ok(names.includes("marketingConsent"), "the consent rides the payload");
  const tokens = [...form.fields.clickQueryTemplate.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
  assert.deepEqual([...tokens].sort(), [...names].sort(), "one {token} per payload field, no more, no less");
});

test("the skeletons obey the contract they illustrate", () => {
  for (const { name, code } of skeletons()) {
    assert.match(code, /event\.preventDefault\(\);\s*onItemContextMenu\?\.\(event, /, `${name}: right-click, preventDefault first`);
    assert.match(code, /component="h3"/, `${name}: the title is a real h3`);
    assert.match(code, /fontFamily: "inherit"/, `${name}: ButtonBase inherits the brand font`);
    assert.match(code, /\[dir="rtl"\] &': \{ transform: "scaleX\(-1\)" \}/, `${name}: directional icons mirror`);
    assert.match(code, /"&:focus-visible": \{ outline:/, `${name}: a visible focus ring`);
    // The comments name the traps on purpose; the checks read the code around them.
    const live = code.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ [^\n]*$/gm, "");
    for (const physical of [/\bml:/, /\bmr:/, /\bpl:/, /\bpr:/, /marginLeft|marginRight|paddingLeft|paddingRight/, /textAlign: "(left|right)"/, /float:/, /direction: "ltr"/]) {
      assert.doesNotMatch(live, physical, `${name}: ${physical} breaks right-to-left sites`);
    }
    assert.doesNotMatch(live, /fontWeight: 800|background\.default|accent\.main|dangerouslySetInnerHTML|new Date\(|<form/, `${name}: a known trap`);
    const params = code.match(/export default function Component\(\{([^}]*)\}/);
    assert.ok(params, `${name}: Component destructures its props`);
    assert.doesNotMatch(params[1], /=/, `${name}: no prop defaults`);
    // Copy is a constant inside the element, never an optional prop the agent would fill with a sample.
    assert.doesNotMatch(
      propsBody(code),
      /\b(title|intro|eyebrow|question|hint|heading|subtitle|submitLabel|ctaLabel|label)\?\s*:\s*string/,
      `${name}: an optional copy prop`
    );
  }
});

test("the form is prefilled, unticked, and keeps emails and phones left to right", () => {
  const [, form] = skeletons();
  assert.match(propsBody(form.code), /initialValues\?: Values/);
  assert.match(form.code, /useState\(false\); \/\/ never pre-ticked/);
  assert.equal((form.code.match(/htmlInput: \{ dir: "ltr"/g) || []).length, 2, "email and phone");
  assert.match(form.code, /type="date"/, "a real date picker");
  assert.doesNotMatch(JSON.stringify(form.fields.propsSchema), /marketingConsent/, "consent is never prefilled");
});

test("the receipt requires only its reference, so a missing field hides a row, not the receipt", () => {
  const [, , receipt] = skeletons();
  assert.deepEqual(receipt.fields.propsSchema.required, ["reference"]);
  assert.match(receipt.code, /overflowWrap: "anywhere"/);
  assert.match(receipt.code, /unicodeBidi: "plaintext"/);
});

test("the contract's phone traps carry the load-bearing rules", () => {
  const text = flat(TRAPS);
  for (const phrase of [
    "Design for a frame of 272 to 374px",
    "phone width minus 16px",
    "phone width minus 48px",
    "A control whose width changes with state gets its own row",
    "`width: 1` is 100%, not 1px",
    '`overflowWrap: "anywhere"`',
    "A sideways pill strip shows the active pill",
    '`ButtonBase` needs `fontFamily: "inherit"`',
    "Use 300, 400 and 700",
    "base64 woff2",
    '`unicodeBidi: "plaintext"`. Never `direction: "ltr"`',
    "Time ranges use a plain hyphen",
    "Dates in the site's language",
    'slotProps={{ htmlInput: { dir: "ltr" } }}',
    "Decode HTML entities, never inject HTML",
    "Parse ISO dates by hand",
    "Never give a data field an `on*` name",
    "No optional copy props",
    "A screen PLACEMENT carries no `defaultProps`",
    "An element with no props still needs a data key on a fixed screen",
  ]) {
    assert.ok(text.includes(phrase), `the traps say: ${phrase}`);
  }
  const elements = flat(ELEMENTS);
  assert.match(elements, /lucide-react is pinned at 0\.453\.0/);
  assert.match(elements, /name a wrapper's prop `to`/);
  assert.match(elements, /Submit from a button's `onClick`/);
  assert.match(elements, /`read_doc element-skeletons`/);
  assert.doesNotMatch(elements, /allow-forms/, "the contract never claims the frame lacks allow-forms");
});

test("the hosted arc starts at the business's own site and ends with a phone check", () => {
  const arc = flat(HOSTED.slice(HOSTED.indexOf("## THE HOSTED BUILD ARC"), HOSTED.indexOf("## The five questions")));
  assert.match(arc, /0\. \*\*Research the business's own site before anything that writes\*\*/);
  assert.match(arc, /the contact form's own fields, options and consent line/);
  assert.match(arc, /Brand from the site's measured values, never guessed/);
  assert.match(arc, /ONE designed element per screen/);
  assert.match(arc, /switch the generic elements off/);
  assert.match(arc, /\*\*Then verify on a phone\*\*, before the wrap-up/);
  const order = flat(section(HOSTED, "## Build order (hosted)"));
  assert.match(order, /the business's own site and the visitor's moment → questions/);
  assert.match(order, /\*\*`publish_site`, immediately, unprompted\*\* → verify on a phone/);
});

test("site data: fixed facts verbatim with their page, the rest live, offers never", () => {
  const text = flat(SITE_DATA);
  assert.match(text, /may be seeded as rows, or written into a skill, exactly as the site words them/);
  assert.match(text, /Each row names the page it came from/);
  assert.match(text, /Never from a screenshot, never estimated/);
  assert.match(text, /What changes on its own is live/);
  assert.match(text, /A time-limited offer is never stored/);
  assert.match(text, /When the site contradicts itself/);
  assert.match(text, /Tell the owner in one sentence/);
  assert.doesNotMatch(flat(HOSTED), /Page text and screenshots are NEVER a data source/, "the old blanket ban is gone");
});

test("persona and skills: the ordered submission, the plain-sentences paragraph, the cap", () => {
  const text = flat(PERSONA);
  assert.match(text, /I do these one after another, never in parallel/);
  assert.match(text, /2\. Only after it returned the created row: escalate_to_owner/);
  assert.match(text, /3\. Then exactly two things and nothing else: the one sentence/);
  assert.ok(
    text.includes(
      "The words a visitor reads from me are plain sentences only. I never write the name or id of a screen, an element or a tool in my text, and I never call a tool named after a screen: screens are shown, not named and not called."
    ),
    "the paragraph that keeps the receipt from failing silently"
  );
  assert.match(text, /\*\*`site-facts`\*\*/);
  assert.match(text, /\*\*`routing`\*\*/);
  assert.match(text, /the form's fixed options, VERBATIM/);
  assert.match(text, /capped at 24,000 characters together/);
  assert.match(text, /every skill after it is dropped, with no warning/);
  assert.match(text, /Read one live transcript after writing the persona/);
});

test("the phone check walks the real submit once and keeps the form's chip live", () => {
  const text = flat(PHONE_CHECK);
  assert.match(text, /The form's chip stays live/);
  assert.match(text, /Walk the real submit once\*\*: create, confirm, receipt/);
  assert.match(text, /`list_entity_records`/);
});

test("the design bar measures the real UI, matches affordance to action, and carries the site's form", () => {
  const text = flat(DESIGN);
  assert.match(text, /Measure the business's real UI instead of guessing it/);
  assert.match(text, /Affordance matches action/);
  assert.match(text, /the site's own fields, options and consent wording, the consent box unticked/);
});

test("the build prompts and get_started point at the skeletons", () => {
  assert.match(read("src/prompts.ts"), /"element-skeletons"/);
  assert.match(read("src/docs/getting-started.md"), /`element-skeletons`/);
});

test("the new doc and the new sections carry no em dash (people read these docs)", () => {
  for (const [name, text] of [
    ["element-skeletons.md", SKELETONS],
    ["Traps that only show on a phone", TRAPS],
    ["Data from the business's own site", SITE_DATA],
    ["Persona and skills that work", PERSONA],
    ["Verify on a phone, after publishing", PHONE_CHECK],
  ]) {
    assert.equal(text.includes("—"), false, `${name} carries an em dash`);
  }
});
