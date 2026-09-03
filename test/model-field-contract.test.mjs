// Guards the `model` field's prose surfaces — the hosted-agent-contract doc
// bullet, upsert_agent_config's describe(), and the BYOK rule — against
// drift. Both model surfaces must name the client registry's green list
// (BranderUX-client lib/server/agent/model-registry.ts — nine rows, slug AND
// display name) and state the serve-time truth the same way: a stored slug
// takes effect on hosted serving only where the model seam is enabled
// (`SERVE_PROVIDER_SEAM=1`, default off during rollout), the site serves the
// default elsewhere, and "the site now answers with it" is said ONLY when the
// caller's instructions say model choice is live (the in-app Builder's system
// prompt reads the same switch — the 2026-09-04 honesty gate). The doc bullet
// is the one place that points at the Agent tab's picker (cost as a RATIO to
// the default, never money); describe() stays UI-free and money-free. The
// BYOK paragraph, the hosted prompt and the server instructions carry the
// never-handle-a-key rule with the same card and credential names.
// Dependency-free (node:test): this repo has no other runner.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const doc = read("src/docs/hosted-agent-contract.md");
const source = read("src/tools/agent.ts");
const prompts = read("src/prompts.ts");
const server = read("src/create-server.ts");

/** The rows the client registry enables (plan §5.2 — nine, all green since Stage 3): slug → display name. */
const GREEN_LIST = {
  "anthropic/claude-sonnet-5": "Claude Sonnet 5",
  "anthropic/claude-haiku-4.5": "Claude Haiku 4.5",
  "anthropic/claude-opus-5": "Claude Opus 5",
  "openai/gpt-5.6-sol": "GPT-5.6 Sol",
  "openai/gpt-5.6-terra": "GPT-5.6 Terra",
  "openai/gpt-5.6-luna": "GPT-5.6 Luna",
  "openai/gpt-5-mini": "GPT-5 mini",
  "google/gemini-3.8-flash": "Gemini 3.8 Flash",
  "google/gemini-2.5-flash": "Gemini 2.5 Flash",
};
const GREEN_SLUGS = Object.keys(GREEN_LIST).sort();

/** BYOK vault names: model-<provider> for every green-list provider. */
const BYOK_CREDENTIALS = ["model-anthropic", "model-openai", "model-google"];

const flat = (text) => text.replace(/\s+/g, " ");
const escapeRx = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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

function docByokParagraph() {
  const start = doc.indexOf("**Your own API key (BYOK).**");
  assert.notEqual(start, -1, "the doc has a BYOK paragraph");
  const rest = doc.slice(start);
  const end = rest.indexOf("\n\n");
  return flat(rest.slice(0, end === -1 ? undefined : end));
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
  test(`${surface}: names exactly the green list, each slug with its display name; the silent default; owner-asked only`, () => {
    assert.deepEqual(slugsIn(text), GREEN_SLUGS);
    assert.equal(GREEN_SLUGS.length, 9);
    for (const [slug, displayName] of Object.entries(GREEN_LIST)) {
      assert.match(text, new RegExp(`${escapeRx(slug)}\`? \\(${escapeRx(displayName)}\\)`));
    }
    assert.match(text, /silent default is `?anthropic\/claude-sonnet-5/);
    assert.match(text, /(?:NEVER set this unless|Set it ONLY when) the owner explicitly ask(?:ed|s) to change the model/);
  });

  test(`${surface}: a stored slug serves only where the model seam is enabled (SERVE_PROVIDER_SEAM=1, default off); the default elsewhere`, () => {
    assert.match(text, /takes effect on hosted serving only where the model seam is enabled/);
    assert.match(text, /SERVE_PROVIDER_SEAM=1/);
    assert.match(text, /default off during rollout/);
    assert.match(text, /serves the default/);
    assert.doesNotMatch(text, /seam ships/);
    assert.doesNotMatch(text, /only STORED/i);
  });

  test(`${surface}: "now answers" is conditional on the instructions saying model choice is live; otherwise SAVED + takes effect later`, () => {
    assert.match(text, /SAVED/);
    assert.match(text, /ONLY when your instructions say model choice is live/);
    assert.match(text, /takes effect when model choice goes live/);
    assert.match(text, /when they say nothing, treat it as not live/);
  });
}

test("describe(): no client UI, nothing about money", () => {
  const text = describeText();
  assert.doesNotMatch(text, /picker/i);
  assert.doesNotMatch(text, /\$|price|cost|money|bill/i);
});

test("doc bullet: the Agent tab's picker shows a RATIO to the default, never money; never recommend by list price", () => {
  const text = docModelBullet();
  assert.match(text, /Where model choice is live, the Agent tab has the same picker/);
  assert.match(text, /RATIO to the default/);
  assert.match(text, /never money/);
  assert.match(text, /NEVER recommend a model by list price/);
});

test("both surfaces name the same green list", () => {
  assert.deepEqual(slugsIn(surfaces[0][1]), slugsIn(surfaces[1][1]));
});

test("doc BYOK paragraph: the card or request_credential model-<provider>, never handled in chat, provider bills the owner", () => {
  const text = docByokParagraph();
  assert.match(text, /Agent tab's "Your API key" card/);
  assert.match(text, /`request_credential` tool with the name `model-<provider>`/);
  for (const name of BYOK_CREDENTIALS) assert.match(text, new RegExp(`\`${name}\``));
  assert.match(text, /stored encrypted server-side, never shown again/);
  assert.match(text, /never ask for a key, never read, echo, or place one in the conversation/);
  assert.match(text, /tell them to remove it/);
  assert.match(text, /billed by that provider to the owner/);
});

test("the hosted prompt and the server instructions mirror the BYOK rule", () => {
  for (const text of [flat(prompts), flat(server)]) {
    assert.match(text, /Agent tab's "Your API key" card/);
    assert.match(text, /request_credential (?:tool )?named model-<provider>/);
    assert.match(text, /never ask for/);
  }
});
