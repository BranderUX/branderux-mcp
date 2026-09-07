// upsert_agent_config merges `policies` over the stored bag (the server stores it
// whole): a partial write must never drop language, handoff or writePolicies.
import assert from "node:assert/strict";
import { test } from "node:test";

import { mergePolicyBag } from "../dist/lib/policy-bag.js";

const STORED = {
  handoff: { email: "owner@example.com" },
  language: "he",
  timezone: "Asia/Jerusalem",
  writePolicies: { create_enquiries: "confirm" },
  loginRequirement: "none",
};

test("a partial patch keeps every stored key", () => {
  const merged = mergePolicyBag(STORED, { entityLabels: { courses: "קורסים" } });
  assert.deepEqual(merged, { ...STORED, entityLabels: { courses: "קורסים" } });
});

test("a patched key replaces the stored value whole; null removes it", () => {
  const merged = mergePolicyBag(STORED, { handoff: null, writePolicies: { create_enquiries: "auto" } });
  assert.equal("handoff" in merged, false);
  assert.deepEqual(merged.writePolicies, { create_enquiries: "auto" });
  assert.equal(merged.language, "he");
});

test("no stored bag (never configured) starts from the patch", () => {
  assert.deepEqual(mergePolicyBag(undefined, { language: "he" }), { language: "he" });
  assert.deepEqual(mergePolicyBag("junk", { language: "he" }), { language: "he" });
});
