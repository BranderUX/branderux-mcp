// Guards the `model` field's two prose surfaces — the hosted-agent-contract
// doc bullet and upsert_agent_config's describe() — against the drift the
// 2026-09-04 review caught: asserting serve-time behavior the client does not
// have yet (an Agent-tab picker, "takes effect") and naming the green list in
// one place only. Dependency-free (node:test): this repo has no other runner.
// When the client's model seam ships (bundle.model read at serve time + the
// Agent-tab picker), update BOTH surfaces and this file in the same change.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = readFileSync(join(root, "src/docs/hosted-agent-contract.md"), "utf8");
const source = readFileSync(join(root, "src/tools/agent.ts"), "utf8");

/** The rows the client registry enables today (BranderUX-client lib/server/agent/model-registry.ts). */
const GREEN_LIST = [
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-opus-5",
  "anthropic/claude-sonnet-5",
];

const flat = (text) => text.replace(/\s+/g, " ");

function docModelBullet() {
  const start = doc.indexOf("- `model` —");
  assert.notEqual(start, -1, "the doc has a `model` bullet");
  const rest = doc.slice(start + 1);
  const end = rest.search(/\n- `/);
  return flat(rest.slice(0, end === -1 ? undefined : end));
}

function describeText() {
  const start = source.indexOf("model: modelSlugSchema");
  assert.notEqual(start, -1, "upsert_agent_config declares model: modelSlugSchema");
  const end = source.indexOf("dailyTokenBudget:", start);
  assert.notEqual(end, -1, "dailyTokenBudget follows the model field");
  const literals = [...source.slice(start, end).matchAll(/"((?:[^"\\]|\\.)*)"/g)];
  return flat(literals.map((match) => match[1]).join(""));
}

/** Every provider/model slug named in the text (wildcards like openai/* are not slugs). */
function slugsIn(text) {
  const found = text.match(/\b(?:anthropic|openai|google)\/[a-z0-9][a-z0-9.:_-]*/g) ?? [];
  return [...new Set(found)].sort();
}

const surfaces = [
  ["doc bullet", docModelBullet()],
  ["describe()", describeText()],
];

for (const [surface, text] of surfaces) {
  test(`${surface}: names exactly the green list`, () => {
    assert.deepEqual(slugsIn(text), GREEN_LIST);
  });

  test(`${surface}: states the slug is stored-only until the seam ships`, () => {
    assert.match(text, /STORED/);
    assert.match(text, /seam ships/);
    assert.match(text, /serves the default/);
  });

  test(`${surface}: claims neither a picker nor that the site runs on the slug`, () => {
    assert.doesNotMatch(text, /picker/i);
    assert.doesNotMatch(text, /take effect;/);
    assert.match(text, /never (?:tell the owner |that )the site now runs on it/);
  });
}

test("both surfaces name the same green list", () => {
  assert.deepEqual(slugsIn(surfaces[0][1]), slugsIn(surfaces[1][1]));
});
