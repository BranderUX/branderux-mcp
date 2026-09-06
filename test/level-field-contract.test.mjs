// Guards the `level` field's prose surfaces — the hosted-agent-contract doc
// bullet, upsert_agent_config's describe(), the hosted prompt and the server
// instructions — against drift. Owners pick an ANSWER-QUALITY STOP (1..5) and
// never hear a model, a vendor or a price (Lev, 2026-09-05): every level
// surface must carry the five owner strings verbatim, must NOT name a
// registry slug / display name / vendor, must never put a number on cost, and
// must state the serve-time truth the same way: a stored stop takes effect on
// hosted serving only where the model seam is enabled (SERVE_PROVIDER_SEAM=1,
// default off during rollout), the site serves the Balanced default
// elsewhere, and "the site now answers with it" is said ONLY when the
// stop always answers (the seam is the only serve runner). The BYOK paragraph, the
// hosted prompt and the server instructions keep the never-handle-a-key rule
// with the same card (now under Advanced in the Answer quality panel) and
// credential names. Dependency-free (node:test): this repo has no other runner.
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

/** The five owner strings (the client's level-copy.ts / builder prompt carry the same). */
const LEVEL_WORDS = [
  "Fastest & cheapest",
  "quick answers to simple questions",
  "Fast",
  "good for FAQs and lookups",
  "Balanced",
  "right for most shops (default)",
  "Smart",
  "a stronger model for harder questions",
  "Smartest & most expensive",
  "our strongest model",
];

/** What an owner must never read on a level surface: the registry's rows and the vendors. */
const FORBIDDEN_ON_LEVEL_SURFACES = [
  "anthropic/claude-sonnet-5",
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-opus-5",
  "openai/gpt-5.6-sol",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "openai/gpt-5-mini",
  "google/gemini-3.8-flash",
  "google/gemini-2.5-flash",
  "Claude Sonnet 5",
  "Claude Haiku 4.5",
  "Claude Opus 5",
  "GPT-5.6 Sol",
  "GPT-5.6 Terra",
  "GPT-5.6 Luna",
  "GPT-5 mini",
  "Gemini 3.8 Flash",
  "Gemini 2.5 Flash",
  "Anthropic",
  "OpenAI",
  "Google",
  "Gemini",
  "GPT",
  "Claude",
  "Sonnet",
];

/** BYOK vault names: model-<provider> for the providers with a VERIFIED gateway BYOK slot — Google has none. */
const BYOK_CREDENTIALS = ["model-anthropic", "model-openai"];

const flat = (text) => text.replace(/\s+/g, " ");

function docLevelBullet() {
  const start = doc.indexOf("- `level` —");
  assert.notEqual(start, -1, "the doc has a `level` bullet");
  const rest = doc.slice(start + 1);
  const end = rest.search(/\n\n/);
  return flat(rest.slice(0, end === -1 ? undefined : end));
}

function describeText() {
  const start = source.indexOf("level: z");
  assert.notEqual(start, -1, "upsert_agent_config declares level: z");
  const end = source.indexOf("dailyTokenBudget:", start);
  assert.notEqual(end, -1, "dailyTokenBudget follows the level field");
  return { block: source.slice(start, end), text: flat([...source.slice(start, end).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join("")) };
}

function docByokParagraph() {
  const start = doc.indexOf("**Your own API key (BYOK).**");
  assert.notEqual(start, -1, "the doc has a BYOK paragraph");
  const rest = doc.slice(start);
  const end = rest.indexOf("\n\n");
  return flat(rest.slice(0, end === -1 ? undefined : end));
}

/** The sentence about answer quality / the model in a prompt text — the level surface of that file. */
function modelSentence(text) {
  const match = flat(text).match(/[^.]*answer quality[^.]*\./i);
  assert.ok(match, "the text has an answer-quality sentence");
  return match[0];
}

test("upsert_agent_config declares `level` (int 1..5, optional) and no longer exposes `model` or `modelTier`", () => {
  const { block } = describeText();
  assert.match(block, /\.number\(\)/);
  assert.match(block, /\.int\(\)/);
  assert.match(block, /\.min\(1\)/);
  assert.match(block, /\.max\(5\)/);
  assert.match(block, /\.optional\(\)/);
  assert.doesNotMatch(source, /modelTier/);
  assert.doesNotMatch(source, /modelSlugSchema/);
  assert.doesNotMatch(source, /\bmodel: /);
});

const surfaces = [
  ["doc bullet", docLevelBullet()],
  ["describe()", describeText().text],
];

for (const [surface, text] of surfaces) {
  test(`${surface}: carries the five owner strings, the silent default, owner-asked only, and translates a named model into a stop`, () => {
    for (const words of LEVEL_WORDS) assert.ok(text.includes(words), `${surface} lacks "${words}"`);
    assert.match(text, /OMIT IT in a normal build|OMIT it in a normal build/);
    assert.match(text, /ONLY when the owner explicitly asks for faster, cheaper or smarter answers/);
    assert.match(text, /translate it into a stop in plain words/);
  });

  test(`${surface}: never names a model, a vendor or a price`, () => {
    for (const forbidden of FORBIDDEN_ON_LEVEL_SURFACES) {
      assert.ok(!text.includes(forbidden), `${surface} names "${forbidden}"`);
    }
    assert.doesNotMatch(text, /\$\d/);
    assert.doesNotMatch(text, /per-token rate(?!s? at all| or a ratio)/);
  });

  test(`${surface}: a stored stop always answers (the seam is the only serve runner) — the tool says which stop now answers and points at the slider, never "SAVED for when it goes live"`, () => {
    assert.match(text, /which stop now answers their customers/);
    assert.match(text, /carries the same (?:five-stop )?slider/);
    assert.match(text, /STORED stop/);
    assert.doesNotMatch(text, /SERVE_PROVIDER_SEAM/);
    assert.doesNotMatch(text, /takes effect when it goes live/);
    assert.doesNotMatch(text, /say the choice is SAVED/);
  });
}

test("doc bullet: live on the next answer, the admin map, and the one cost fact", () => {
  const text = docLevelBullet();
  assert.match(text, /live on the site's next answer/);
  assert.match(text, /Admin → Model Levels/);
  assert.match(text, /higher stops cost more per conversation turn, lower stops less/);
  assert.match(text, /never a price, a dollar amount, a per-token rate or a ratio/);
  assert.doesNotMatch(doc, /- `model` —/);
  assert.doesNotMatch(doc, /- `modelTier` —/);
});

test("the hosted prompt and the server instructions never ask about answer quality or a model, and name no model, vendor or price in that sentence", () => {
  for (const text of [prompts, server]) {
    const sentence = modelSentence(text);
    assert.match(sentence, /[Nn]ever ask/);
    assert.match(sentence, /balanced default/i);
    for (const forbidden of FORBIDDEN_ON_LEVEL_SURFACES) {
      assert.ok(!sentence.includes(forbidden), `prompt sentence names "${forbidden}"`);
    }
  }
});

test("doc BYOK paragraph: the card under Advanced or request_credential model-<provider>, never handled in chat, provider bills the owner", () => {
  const text = docByokParagraph();
  assert.match(text, /"Your API key" card \(under Advanced in the Agent tab's Answer quality panel\)/);
  assert.match(text, /`request_credential` tool with the name `model-<provider>`/);
  for (const name of BYOK_CREDENTIALS) assert.match(text, new RegExp(`\`${name}\``));
  assert.doesNotMatch(text, /model-google/, "no vault name for Google — it has no BYOK slot");
  assert.match(text, /Google keys are not supported yet/);
  assert.match(text, /stored encrypted server-side, never shown again/);
  assert.match(text, /never ask for a key, never read, echo, or place one in the conversation/);
  assert.match(text, /tell them to remove it/);
  assert.match(text, /billed by that provider to the owner/);
});

test("the hosted prompt and the server instructions mirror the BYOK rule", () => {
  for (const text of [flat(prompts), flat(server)]) {
    assert.match(text, /"Your API key" card under Advanced in the Agent tab's Answer quality panel/);
    assert.match(text, /request_credential (?:tool )?named model-<provider>/);
    assert.match(text, /never ask for/);
  }
});
