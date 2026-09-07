// Guards the plain-website widget's prose surfaces — the `widget` entry of
// SNIPPETS (the one script line an owner pastes into Wix, WordPress, Shopify,
// Squarespace or static HTML), get_integration_snippet's description and the
// hosted-agent-contract doc's closing step — against drift. The line is
// `<script src="https://branderux.com/widget/v1.js" data-key="…" data-preload="eager" async>`; the
// key's origin allow-list must carry the site's EXACT origin (the loader
// exchanges the key from the owner's page and any other origin is refused),
// the two brand attributes ride as commented options, own buttons open it via
// data-brander-open, and a React/Next app mounts the SDK instead. The arc's
// closing step sends plain sites to target `widget` with the key allow-listed
// through set_key_origins, and says nothing when there is no existing site.
// Dependency-free (node:test), like its sibling.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const snippets = read("src/tools/snippets.ts");
const knowledge = read("src/tools/knowledge.ts");
const doc = read("src/docs/hosted-agent-contract.md");

const flat = (text) => text.replace(/\s+/g, " ");

/** The `widget` template literal of SNIPPETS, as text (the file is TS; no loader here). */
function widgetSnippet() {
  const key = "\n  widget: `";
  const start = snippets.indexOf(key);
  assert.notEqual(start, -1, "SNIPPETS has a `widget` entry");
  const body = start + key.length;
  const end = snippets.indexOf("`", body);
  assert.notEqual(end, -1, "the widget template literal closes");
  return snippets.slice(body, end);
}

/** The one script line of the widget snippet. */
function scriptLine() {
  const line = widgetSnippet().match(/<script[^\n]*<\/script>/);
  assert.ok(line, "the widget snippet has a <script> line");
  return line[0];
}

/** get_integration_snippet's title + description strings. */
function describeText() {
  const start = knowledge.indexOf('"get_integration_snippet"');
  assert.notEqual(start, -1, "knowledge.ts registers get_integration_snippet");
  const end = knowledge.indexOf("inputSchema:", start);
  assert.notEqual(end, -1, "inputSchema follows the description");
  return flat([...knowledge.slice(start, end).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join(""));
}

/** Step 7 of THE HOSTED BUILD ARC — the closing step after publish_site + WRAP-UP. */
function docClosingStep() {
  const wrapUp = doc.indexOf("**WRAP-UP");
  assert.notEqual(wrapUp, -1, "the doc has the WRAP-UP");
  const start = doc.indexOf("\n7. **", wrapUp);
  assert.notEqual(start, -1, "the arc has a step 7 after the WRAP-UP");
  const rest = doc.slice(start + 1);
  const end = rest.search(/\n\n/);
  return flat(rest.slice(0, end === -1 ? undefined : end));
}

/** The "Build order (hosted)" section, up to the next heading. */
function docBuildOrder() {
  const start = doc.indexOf("## Build order (hosted)");
  assert.notEqual(start, -1, "the doc has the Build order (hosted) section");
  const rest = doc.slice(start);
  const end = rest.indexOf("\n## ", 1);
  return flat(rest.slice(0, end === -1 ? undefined : end));
}

test("widget snippet: the one script line — the v1 loader, data-key, async", () => {
  const line = scriptLine();
  assert.match(
    line,
    /^<script src="https:\/\/branderux\.com\/widget\/v1\.js" data-key="<your-key>" data-preload="eager" async><\/script>$/
  );
  // Every handed-out line preloads: a hosted build's designed home replays with no model call.
  assert.match(widgetSnippet(), /data-preload="eager" — keep it/);
});

test("widget snippet: the two brand attributes ride as commented options, never on the line", () => {
  assert.doesNotMatch(scriptLine(), /data-color|data-icon/);
  const text = widgetSnippet();
  assert.match(text, /data-color="#hex"/);
  assert.match(text, /data-icon="https:\/\/<slug>\.branderux\.app\/brand-icon"/);
  for (const option of ['data-position="left"', 'data-launcher="none"', "data-label=", 'data-lang="he"']) {
    assert.ok(text.includes(option), `widget snippet lacks the ${option} option`);
  }
});

test("widget snippet: the key's allow-list must carry the site's exact origin", () => {
  const text = flat(widgetSnippet());
  assert.match(text, /project API key \(create_api_key, bux_pk_…\)/);
  assert.match(text, /allow-list \(set_key_origins\) MUST contain the site's EXACT origin/);
  assert.match(text, /any origin not on the list is refused/);
});

test("widget snippet: where to paste it — Wix and WordPress named, Shopify and everything else before </body>", () => {
  const text = flat(widgetSnippet());
  assert.match(text, /Wix: Settings → Custom Code \(needs a Premium plan with a connected domain\)/);
  assert.match(text, /WordPress: the theme's custom code, a headers-and-footers plugin, or a Custom HTML block/);
  assert.match(text, /Shopify: theme\.liquid, right before <\/body>/);
  assert.match(text, /Anything else: right before <\/body>/);
});

test("widget snippet: own buttons open it via data-brander-open, and visitors are never asked to sign in", () => {
  const text = flat(widgetSnippet());
  assert.match(text, /any element with data-brander-open, the class brander-open, or a link to #brander-chat opens the widget/);
  assert.match(text, /data-brander-open="anchor" opens it above that element/);
  assert.match(text, /<button data-brander-open>/);
  assert.match(text, /serves visitors anonymously/);
});

test("widget snippet: not for React/Next apps — those mount the SDK", () => {
  const text = flat(widgetSnippet());
  assert.match(text, /NOT for React\/Next apps: those mount the SDK instead/);
  assert.match(text, /<BranderChatWidget apiKey projectId \/>/);
});

test("get_integration_snippet describe(): names the widget as the plain-website option", () => {
  const text = describeText();
  assert.match(text, /`widget` — the one-line script tag for a plain website/);
  assert.match(text, /Wix, WordPress, Shopify, Squarespace, static HTML/);
  assert.match(text, /a React\/Next app mounts the SDK instead/);
});

test("contract doc closing step: plain sites → target widget with the key allow-listed through set_key_origins; React/Next → the SDK; no site → say nothing", () => {
  const text = docClosingStep();
  assert.match(text, /`get_integration_snippet` target `widget`/);
  assert.match(text, /`set_key_origins`/);
  assert.match(text, /Wix, WordPress, Shopify, Squarespace, static HTML/);
  assert.match(text, /`data-color` from the brand's primary color/);
  assert.match(text, /`data-icon` with `https:\/\/<slug>\.branderux\.app\/brand-icon`/);
  assert.match(text, /Wix: Settings → Custom Code/);
  assert.match(text, /WordPress: the theme's custom code/);
  assert.match(text, /React\/Next codebase/);
  assert.match(text, /`<BranderChatWidget apiKey projectId \/>`/);
  assert.match(text, /With no existing site, say nothing/);
});

test("contract doc Build order (hosted): the closing step rides there in one line", () => {
  const text = docBuildOrder();
  assert.match(text, /`get_integration_snippet` target `widget`/);
  assert.match(text, /`set_key_origins`/);
  assert.match(text, /React\/Next/);
});
