import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * Writes complete in the widget (2026-09-17). The client's click route accepts
 * the embed's key bearer and the proposal's session key in-band, and serve
 * mounts confirm-mode tools in key mode, so the words on every surface a
 * builder reads must no longer send a widget's write to `auto`.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const flat = (text) => text.replace(/\s+/g, " ");

const hosted = flat(read("src/docs/hosted-agent-contract.md"));
const prompts = read("src/prompts.ts");
const agentTools = read("src/tools/agent.ts");

test("the contract says confirm-mode writes complete in the widget, on all three surfaces it states it", () => {
  assert.match(
    hosted,
    /run on the published site and inside the chat widget or SDK embed on the owner's own site alike/
  );
  assert.match(
    hosted,
    /the published `\{slug\}\.branderux\.app` site and the widget or SDK embed on the customer's own domain alike/
  );
  assert.match(
    hosted,
    /confirm and auto both complete on the published site and in the widget or SDK embed on the owner's site/
  );
});

test("the old limitation is gone from the contract", () => {
  assert.doesNotMatch(hosted, /run ONLY on the published site/);
  assert.doesNotMatch(hosted, /completes only `auto`-mode writes/);
  assert.doesNotMatch(hosted, /needs the Confirm card \(the `\{slug\}\.branderux\.app` site\)/);
});

test("publish_site and the hosted prompt keep sign-in on the site and let writes run in the widget", () => {
  assert.match(
    agentTools,
    /Writes and owner emails run on the published site and in the widget on the owner's site; sign-in only on the published site\./
  );
  assert.doesNotMatch(agentTools, /only run on the published site/);
  assert.match(
    prompts,
    /remind me that writes and emails run there and in the widget on my site, and sign-in on the site itself\./
  );
});

test("the rewritten sentences carry no em dash", () => {
  for (const sentence of [
    /Where writes execute[^.]*\./,
    /Where confirm-mode writes complete[^.]*\./,
    /confirm and auto both complete[^|]*/,
  ]) {
    const match = hosted.match(sentence);
    assert.ok(match, `sentence present: ${sentence}`);
    assert.doesNotMatch(match[0], /—/);
  }
});
