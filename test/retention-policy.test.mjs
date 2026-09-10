// policies.transcriptRetentionDays decides when end-user conversations,
// visitor events and session analytics are hard-deleted — and the published
// site's privacy notice STATES that number. The server reads it as a JSON
// number: a quoted "365" is ignored and the 180-day default silently applies,
// so the notice would promise a period nothing enforces. upsert_agent_config
// refuses the string; both prose surfaces say so. Dependency-free (node:test).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { registerAgentTools } from "../dist/tools/agent.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "src/tools/agent.ts"), "utf8");
const doc = readFileSync(join(root, "src/docs/hosted-agent-contract.md"), "utf8");

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";
const STORED = { language: "he", transcriptRetentionDays: 365 };

/** A fake ApiClient recording every call; GET answers with the stored config. */
function fakeApi(stored = STORED) {
  const calls = { get: [], put: [] };
  return {
    calls,
    get: async (path) => {
      calls.get.push(path);
      return { policies: stored };
    },
    put: async (path, body) => {
      calls.put.push({ path, body });
      return body;
    },
  };
}

/** Register the agent tools on a fake McpServer and hand back the upsert handler. */
function upsertAgentConfig(api) {
  const tools = new Map();
  registerAgentTools({ registerTool: (name, _config, handler) => tools.set(name, handler) }, api);
  const handler = tools.get("upsert_agent_config");
  assert.ok(handler, "upsert_agent_config is registered");
  return handler;
}

test("a QUOTED period is refused — and never reaches the server", async () => {
  const api = fakeApi();
  const result = await upsertAgentConfig(api)({
    projectId: PROJECT,
    policies: { transcriptRetentionDays: "365" },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /must be a JSON number of days, 30–730/);
  assert.deepEqual(api.calls.get, [], "no read");
  assert.deepEqual(api.calls.put, [], "nothing stored");
});

test("every other non-number is refused too", async () => {
  for (const value of [true, { days: 365 }, [365], "180"]) {
    const api = fakeApi();
    const result = await upsertAgentConfig(api)({
      projectId: PROJECT,
      policies: { transcriptRetentionDays: value },
    });
    assert.equal(result.isError, true, `${JSON.stringify(value)} was accepted`);
    assert.deepEqual(api.calls.put, []);
  }
});

test("a JSON number is stored, merged over the bag", async () => {
  const api = fakeApi({ language: "he", handoff: { email: "owner@example.com" } });
  const result = await upsertAgentConfig(api)({
    projectId: PROJECT,
    policies: { transcriptRetentionDays: 30 },
  });
  assert.notEqual(result.isError, true);
  assert.deepEqual(api.calls.put[0].body.policies, {
    language: "he",
    handoff: { email: "owner@example.com" },
    transcriptRetentionDays: 30,
  });
});

test("null removes the period — the removal is not a bad type", async () => {
  const api = fakeApi();
  const result = await upsertAgentConfig(api)({
    projectId: PROJECT,
    policies: { transcriptRetentionDays: null },
  });
  assert.notEqual(result.isError, true);
  assert.equal("transcriptRetentionDays" in api.calls.put[0].body.policies, false);
  assert.equal(api.calls.put[0].body.policies.language, "he");
});

test("a patch that does not mention the period leaves the stored one alone", async () => {
  const api = fakeApi();
  await upsertAgentConfig(api)({ projectId: PROJECT, policies: { timezone: "Asia/Jerusalem" } });
  assert.equal(api.calls.put[0].body.policies.transcriptRetentionDays, 365);
});

test("the tool description and the contract both say JSON number, the range, the default and what a quoted value does", () => {
  for (const [surface, text] of [
    ["describe()", source],
    ["contract", doc],
  ]) {
    assert.ok(/JSON NUMBER|JSON number/.test(text), `${surface} does not call it a JSON number`);
    assert.ok(text.includes("30–730"), `${surface} lacks the range`);
    assert.ok(text.includes("default 180"), `${surface} lacks the default`);
    assert.ok(/clamped/.test(text), `${surface} lacks the clamp`);
    assert.ok(
      /quoted[^.]{0,90}ignored by the server/i.test(text),
      `${surface} does not say a quoted value is ignored by the server`
    );
  }
});
