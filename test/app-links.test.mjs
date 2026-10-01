// One-click links into the owner's Agent tab (the web app's agent-url.ts params): the
// format, the optional params, the encoding, and the CRM's manage link. The four tools
// that carry them are pinned in owner-data-tools.test.mjs and owner-crm-tools.test.mjs.
// Dependency-free (node:test) like its siblings.
import assert from "node:assert/strict";
import { test } from "node:test";

import { agentTabLink, crmManageLink } from "../dist/lib/app-links.js";
import { APP_BASE } from "../dist/config.js";

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";
const AGENT = `${APP_BASE}/projects?tab=agent&project=${PROJECT}`;

test("a section link names the tab, the project and the section, and nothing else", () => {
  assert.equal(agentTabLink(PROJECT, "overview"), `${AGENT}&section=overview`);
  assert.equal(agentTabLink(PROJECT, "analytics", {}), `${AGENT}&section=analytics`);
});

test("each optional param is added only when given, in a fixed order", () => {
  const RECORD = "4f0c6a8e-1d2b-4c3a-9e8f-7a6b5c4d3e2f";
  assert.equal(agentTabLink(PROJECT, "inbox", { record: RECORD }), `${AGENT}&section=inbox&record=${RECORD}`);
  assert.equal(
    agentTabLink(PROJECT, "conversations", { session: "abc-123" }),
    `${AGENT}&section=conversations&session=abc-123`
  );
  assert.equal(agentTabLink(PROJECT, "inbox", { settings: true }), `${AGENT}&section=inbox&settings=1`);
  assert.equal(agentTabLink(PROJECT, "inbox", { settings: false }), `${AGENT}&section=inbox`);
  assert.equal(agentTabLink(PROJECT, "inbox", { crm: "hubspot" }), `${AGENT}&section=inbox&crm=hubspot`);
  assert.equal(
    agentTabLink(PROJECT, "inbox", { crm: "hubspot", settings: true, session: "s1", record: "r1" }),
    `${AGENT}&section=inbox&record=r1&session=s1&settings=1&crm=hubspot`
  );
  assert.equal(agentTabLink(PROJECT, "inbox", { record: "", crm: "" }), `${AGENT}&section=inbox`);
});

test("every value is URL-encoded, so no value can add a param of its own", () => {
  const link = agentTabLink("a b&c", "inbox", { record: "x&settings=1", crm: "monday crm/é" });
  assert.equal(
    link,
    `${APP_BASE}/projects?tab=agent&project=a%20b%26c&section=inbox&record=x%26settings%3D1&crm=monday%20crm%2F%C3%A9`
  );
  const params = new URL(link).searchParams;
  assert.deepEqual([...params.keys()], ["tab", "project", "section", "record", "crm"]);
  assert.equal(params.get("record"), "x&settings=1");
  assert.equal(params.get("crm"), "monday crm/é");
});

test("the CRM's manage link opens that CRM's screen when one is connected, else Inbox settings", () => {
  assert.equal(crmManageLink(PROJECT, "hubspot"), `${AGENT}&section=inbox&crm=hubspot`);
  assert.equal(crmManageLink(PROJECT, null), `${AGENT}&section=inbox&settings=1`);
});

test("the links point at the configured web app", () => {
  assert.ok(agentTabLink(PROJECT, "inbox").startsWith(`${APP_BASE}/projects?`));
  assert.doesNotMatch(APP_BASE, /\/$/, "no trailing slash before /projects");
});
