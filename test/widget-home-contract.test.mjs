// The two PROSE halves of this feature pair: the hosted-agent contract's
// "Fixed screens for fixed queries" + "The widget home (a default)", the arc
// step and the hosted prompt that route a build into them, and the custom
// elements contract's QueriesList reference element. Everything here is read
// by a model mid-build, so drift is invisible until a live site answers a chip
// with a shrug: the phrases guarded below are the load-bearing ones (the
// verbatim-query rule, the chat-bubble trigger, the welcome text, the queries
// list, the owner's instructions winning, the coverage that now comes from the
// report's uncoveredQueries). The reference element is compiled with the REAL
// publish pre-flight, so a doc example can never ship code create_element
// would reject. Dependency-free (node:test) like its siblings.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { deriveInteraction } from "../dist/lib/element-actions.js";
import { checkInteractionWiring, validateElementCode } from "../dist/tools/elements.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const hosted = read("src/docs/hosted-agent-contract.md");
const elements = read("src/docs/custom-elements-contract.md");
const prompts = read("src/prompts.ts");
const agentTools = read("src/tools/agent.ts");

const flat = (text) => text.replace(/\s+/g, " ");

/** One "## …" section of a doc, up to the next one. */
function section(doc, heading) {
  const start = doc.indexOf(heading);
  assert.notEqual(start, -1, `the doc is missing "${heading}"`);
  const rest = doc.slice(start);
  const end = rest.indexOf("\n## ", 1);
  return rest.slice(0, end === -1 ? undefined : end);
}

/** One numbered step of a build arc, up to the next number. */
function step(text, opener, next) {
  const start = text.indexOf(opener);
  assert.notEqual(start, -1, `no step starting "${opener}"`);
  const rest = text.slice(start);
  const end = rest.indexOf(next);
  return flat(rest.slice(0, end === -1 ? undefined : end));
}

const FIXED = section(hosted, "## Fixed screens for fixed queries (`set_fixed_screens`)");
const WIDGET_HOME = section(hosted, "## The widget home (a default)");
const QUERIES_LIST = section(elements, "## Queries list (a widget's home)");
const ARC_STEP = step(hosted, "5. `set_home_screen`", "\n6. ");
const PROMPT_STEP = step(prompts, "7. put_screen the screens", "\n8. ");

// --- fixed screens ---------------------------------------------------------

test("fixed screens: what they are for, in the owner's own examples", () => {
  const text = flat(FIXED);
  assert.match(text, /the menu, the price list, opening hours/);
  assert.match(text, /zero model calls/);
  assert.match(text, /bindings still run live/);
});

test("fixed screens: the match is EXACT, and a matching chip is INTERCEPTED before any AI runs", () => {
  const text = flat(FIXED);
  assert.match(text, /The match is EXACT\*\*, after trim, lowercase and collapsed whitespace/);
  assert.match(text, /not a substring, not a paraphrase/);
  assert.match(text, /is answered by that screen BEFORE any AI runs/);
  assert.match(text, /the visitor's own words enter the conversation and the designed screen comes back under them/);
  assert.match(text, /must be identical, character for character/);
});

test("fixed screens: the limits the server enforces", () => {
  const text = flat(FIXED);
  assert.match(text, /`screens` \(max 12\)/);
  assert.match(text, /`bindings\?` \(max 3\)/);
  assert.match(text, /`screens: \[\]` clears/);
  assert.match(text, /REPLACES the stored set/);
  assert.match(text, /400, with the reason/);
  assert.match(text, /over 128 KB/);
  assert.match(text, /a screen id, an entity\s*or a field does not exist/);
  assert.match(text, /collide after normalisation/);
});

test("fixed screens: the home keeps its own rules, and substring-on-the-first-turn is the home's alone", () => {
  const text = flat(FIXED);
  assert.match(text, /The home is separate/);
  assert.match(text, /substring match on the FIRST turn is the home's alone/);
  assert.match(text, /A fixed screen works on every turn/);
  assert.equal(
    (flat(FIXED).match(/never matches on a substring/g) || []).length,
    0,
    "the EXACT bullet already says a substring never matches"
  );
});

test("fixed screens: coverage is the report's uncoveredQueries, never a remembered list", () => {
  const text = flat(FIXED);
  assert.match(text, /Coverage is read, not remembered/);
  assert.match(text, /`uncoveredQueries`/);
  assert.match(
    text,
    /answered LIVE by the agent, so keep one that way only where a skill covers it on purpose \(`list_skills` says which\) or where the chip fires a write tool/
  );
  assert.match(text, /`list_fixed_screens` reads back what is actually stored/);
});

// --- the widget home -------------------------------------------------------

test("widget home: the trigger is the chat bubble on the owner's own site, and only with no home instructions", () => {
  const text = flat(WIDGET_HOME);
  assert.match(text, /floating CHAT BUBBLE on the owner's own site/);
  assert.match(text, /`BranderChatWidget` in a React site/);
  assert.match(text, /one-line script-tag widget on Wix, WordPress, Shopify, Squarespace or plain HTML/);
  assert.match(text, /AND the owner has said nothing about what the home should be/);
});

test("widget home: the welcome text unchanged, then ONE queries list", () => {
  const text = flat(WIDGET_HOME);
  assert.match(text, /the welcome text exactly as it is today \(`followUpText`\)/);
  assert.match(text, /ONE "queries list" element/);
  assert.match(text, /Most are static chips/);
  assert.match(text, /At most ONE of them collects a field or fields/);
  assert.match(text, /ONE featured block bound to live rows/);
});

test("widget home: the shape comes from THIS customer, with no fixed count or layout", () => {
  const text = flat(WIDGET_HOME);
  assert.match(text, /entities and the fields they can be filtered by/);
  assert.match(text, /the skills, the write tools that mounted/);
  assert.match(text, /scraped navigation and page titles/);
  assert.match(text, /custom pages/);
  assert.match(text, /`policies.language`/);
  assert.match(text, /no fixed count and no fixed layout/);
});

test("widget home: the askable test drops a question nothing answers", () => {
  const text = flat(WIDGET_HOME);
  assert.match(text, /askable test/);
  assert.match(text, /name what answers it: a fixed screen, a skill, or a tool/);
  assert.match(text, /A question nothing answers is dropped/);
});

test("widget home: every answerable question gets a fixed screen whose matchQuery is that chip's query", () => {
  const text = flat(WIDGET_HOME);
  assert.match(text, /gets a fixed screen \(`set_fixed_screens`\) whose `matchQuery` is that chip's query VERBATIM/);
  assert.match(text, /The rest are answered live: a skill, the persona, or, for the action chip, the write tool it fires/);
});

test("widget home: the owner's instructions win, and the default is off for a site, a page and a panel", () => {
  const text = flat(WIDGET_HOME);
  assert.match(text, /The owner's instructions win/);
  assert.match(text, /beats this default/);
  assert.match(text, /hosted full site/);
  assert.match(text, /a full page or an inline panel inside the owner's own site \(the SDK's `<Brander \/>`\)/);
  assert.match(text, /Those keep today's home/);
});

test("widget home: unclear usage asks ONCE, in those words", () => {
  assert.match(
    flat(WIDGET_HOME),
    /"Where will this run: as a chat bubble on your site, as a page inside your site, or as the whole site\?"/
  );
  assert.match(flat(WIDGET_HOME), /ask ONCE/);
});

test("widget home: coverage points at the verification's uncoveredQueries", () => {
  const text = flat(WIDGET_HOME);
  assert.match(text, /Coverage comes from the verification/);
  assert.match(text, /Each report names this screen's `uncoveredQueries`: the chips on the list that no canned screen answers/);
  assert.match(
    text,
    /leave it live only where a skill covers it on purpose or where the chip fires a write tool \(the action chip\), and build a fixed screen for each of the rest/
  );
  assert.match(text, /A chip that lands on a shrug is worse than no chip/);
});

test("widget home: it points at the reference element, and calls it a starting point", () => {
  const text = flat(WIDGET_HOME);
  assert.match(text, /custom-elements-contract/);
  assert.match(text, /Queries list \(a widget's home\)/);
  assert.match(text, /starting point, not a house style/);
});

// --- the arc, the build order, the prompt ----------------------------------

test("the hosted arc's home step carries both rules", () => {
  assert.match(ARC_STEP, /`set_fixed_screens`/);
  assert.match(ARC_STEP, /answered by that screen before any AI runs, so the two wordings must be identical/);
  assert.match(ARC_STEP, /CHAT-WIDGET build with no home instructions/);
  assert.match(ARC_STEP, /welcome text plus a queries list/);
  assert.match(ARC_STEP, /fixed screens behind its answerable questions/);
  assert.match(ARC_STEP, /run `verify_canned_screens` before you publish/);
  assert.match(ARC_STEP, /both rules, and the coverage that report names, are under "Fixed screens for fixed queries"/);
  assert.doesNotMatch(ARC_STEP, /uncoveredQueries/, "the coverage rule is stated in the sections the arc points at");
});

test("the build order names both, and keeps publish_site as the last step", () => {
  const order = flat(section(hosted, "## Build order (hosted)"));
  assert.match(order, /`set_fixed_screens`/);
  assert.match(order, /widget-home default when the build is a chat bubble/);
  assert.match(order, /\*\*`publish_site`, immediately, unprompted\*\*/);
});

test("the hosted prompt's step 7 says it in the owner's voice", () => {
  assert.match(PROMPT_STEP, /set_fixed_screens/);
  assert.match(PROMPT_STEP, /my menu, my price list, my opening hours/);
  assert.match(PROMPT_STEP, /the wording on the chip and the wording of the screen have to be identical/);
  assert.match(PROMPT_STEP, /chat bubble on my own site/);
  assert.match(PROMPT_STEP, /welcome text exactly as it is/);
  assert.match(PROMPT_STEP, /queries list/);
  assert.match(PROMPT_STEP, /anything I have told you about my home wins over it/);
  assert.match(
    PROMPT_STEP,
    /is answered by that screen before any AI runs: my visitor's own words go into the conversation and my designed screen comes back under them, so the wording on the chip and the wording of the screen have to be identical, character for character/
  );
  assert.match(PROMPT_STEP, /as a chat bubble on my site, as a page inside my site, or as the whole site\?/);
});

test("the manual coverage walk is GONE from the prompt and the contract", () => {
  // It was the old mechanism's workaround: chips could not reach a fixed screen,
  // so the builder had to audit the list by hand. The interception replaced it.
  for (const [name, text] of [["the hosted prompt", flat(prompts)], ["the contract", flat(hosted)]]) {
    assert.doesNotMatch(text, /one question at a time/, `${name} still walks the list by hand`);
    assert.doesNotMatch(text, /list_fixed_screens` and `list_skills/, `${name} still pairs the two reads as a coverage check`);
    assert.doesNotMatch(text, /list_fixed_screens and list_skills/, `${name} still pairs the two reads as a coverage check`);
    assert.doesNotMatch(text, /walk (that|the) list/, `${name} still says walk the list`);
  }
});

test("the tools describe themselves the same way the contract does", () => {
  assert.match(agentTools, /"set_fixed_screens"/);
  assert.match(agentTools, /"list_fixed_screens"/);
  assert.match(flat(agentTools), /matches matchQuery EXACTLY \(after trim, lowercase and collapsed whitespace\)/);
  assert.match(flat(agentTools), /is answered by that screen BEFORE any AI runs/);
  assert.match(flat(agentTools), /a chip's query and its screen's matchQuery must be identical/);
  assert.match(flat(agentTools), /screens: \[\] CLEARS them all/);
  assert.match(flat(agentTools), /max 12 screens/);
  assert.match(flat(agentTools), /set_home_screen owns it/);
});

// --- the QueriesList reference element -------------------------------------

/** The first ```tsx fence of the queries-list section. */
function elementCode() {
  const fence = QUERIES_LIST.match(/```tsx\n([\s\S]*?)```/);
  assert.ok(fence, "the section carries a tsx fence");
  return fence[1];
}

/** The ```json fences of that section, in order (templates, then defaultProps). */
function jsonFences() {
  return [...QUERIES_LIST.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => JSON.parse(match[1]));
}

test("the reference element passes the REAL publish pre-flight", () => {
  assert.deepEqual(validateElementCode(elementCode(), "component"), []);
});

test("the reference element obeys the contract it sits in", () => {
  const code = elementCode();
  assert.match(code, /export interface Props \{/);
  assert.match(code, /export default function Component\(/);
  assert.doesNotMatch(code, /^\s*(items|featured|onAsk)\s*=\s/m, "no default values on props");
  assert.match(code, /onItemContextMenu\?\.\(event, item\)/, "right-click is wired per item");
  assert.match(code, /event\.preventDefault\(\);\s*onItemContextMenu/, "preventDefault comes first");
  assert.match(code, /component="h3"/, "a real heading");
  assert.match(code, /alt=\{item\.name\}/, "images carry a describing alt");
  assert.match(code, /"&:focus-visible": \{ outline: "2px solid"/, "the focus ring is visible");
  assert.match(code, /<Button/, "activatable things are real controls");
  assert.match(code, /<CardActionArea/);
  assert.match(code, /label=\{field\.label\}/, "form fields are labelled");
  assert.match(code, /helperText=/, "an invalid field says so");
  for (const physical of [/\bml:/, /\bmr:/, /\bpl:/, /\bpr:/, /marginLeft/, /paddingRight/, /textAlign: "left"/, /float:/]) {
    assert.doesNotMatch(code, physical, `physical side ${physical} breaks RTL`);
  }
  assert.doesNotMatch(code, /background\.default|accent\.main/, "forbidden palette tokens");
  assert.match(code, /from "@mui\/material"/);
  assert.doesNotMatch(code, /from "(?!react|@mui\/material)/, "imports stay on the allowlist");
});

test("the callbacks derive as the contract says, so `$primary` is the featured template's key", () => {
  const derived = deriveInteraction(elementCode(), null);
  assert.equal(derived.actionProp, "onSelectFeatured");
  assert.deepEqual(derived.extraActionProps, ["onAsk", "onSubmitAction"]);
  const [templates] = jsonFences();
  assert.deepEqual(Object.keys(templates).sort(), ["$primary", "onAsk", "onSubmitAction"]);
  assert.equal(templates.onAsk, "{query}", "a chip sends its query and nothing else");
  assert.deepEqual(
    checkInteractionWiring({
      code: elementCode(),
      propsSchema: {},
      clickQueryTemplate: JSON.stringify(templates),
      interactionPropName: "onSelectFeatured",
    }),
    []
  );
});

test("the action template names EVERY field of the action item", () => {
  const [templates, defaults] = jsonFences();
  const action = defaults.items.find((item) => item.kind === "action");
  assert.ok(action?.fields?.length, "the demo data has one action item with fields");
  assert.equal(defaults.items.filter((item) => item.kind === "action").length, 1, "at most one action item");
  for (const field of action.fields) {
    assert.ok(
      templates.onSubmitAction.includes(`{${field.name}}`),
      `the action template drops "${field.name}", so the agent never sees it`
    );
  }
  assert.match(flat(QUERIES_LIST), /action template must name EVERY field/);
});

test("the demo data is the shape the element renders, with https images", () => {
  const [, defaults] = jsonFences();
  for (const item of defaults.items) {
    assert.match(item.kind, /^(question|action)$/);
    assert.ok(item.id && item.label && item.query);
  }
  for (const item of defaults.featured.items) {
    assert.match(item.imageUrl, /^https:\/\//);
  }
  assert.match(flat(QUERIES_LIST), /structurePrompt/);
  assert.match(flat(QUERIES_LIST), /Write every label in the site's language/);
});

test("the section says the layout is a starting point and the callback contract is what stays", () => {
  const text = flat(QUERIES_LIST);
  assert.match(text, /STARTING POINT, not a house style/);
  assert.match(text, /keep only the callback contract/);
  assert.match(text, /every tap still sends its query verbatim/);
  assert.match(text, /renders identically/, "the Hebrew note");
});

test("the added doc sections carry no em dash (people read these docs)", () => {
  for (const [name, text] of [
    ["Fixed screens for fixed queries", FIXED],
    ["The widget home (a default)", WIDGET_HOME],
    ["Queries list (a widget's home)", QUERIES_LIST],
  ]) {
    assert.equal(text.includes("—"), false, `${name} carries an em dash`);
  }
});
