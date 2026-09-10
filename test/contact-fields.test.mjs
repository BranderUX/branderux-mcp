// An intake entity's contact fields are read from the DEFINITION's jsonSchema
// property names (rows may not exist yet), and drive the `notice` that rides
// list_entity_records: a list of contact details may not be marketed to
// without the consent recorded on each row (hosted-agent-contract, "Collecting
// contact details"). Dependency-free (node:test) like the rest of this suite.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { contactFields, contactRecordsNotice } from "../dist/lib/contact-fields.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "src/tools/agent.ts"), "utf8");
const doc = readFileSync(join(root, "src/docs/hosted-agent-contract.md"), "utf8");

const schema = (...names) => ({
  type: "object",
  properties: Object.fromEntries(names.map((name) => [name, { type: "string" }])),
});

test("contact fields are found by property name, in every casing", () => {
  assert.deepEqual(contactFields(schema("email")), ["email"]);
  assert.deepEqual(contactFields(schema("customerEmail", "name")), ["customerEmail"]);
  assert.deepEqual(contactFields(schema("recipient_phone")), ["recipient_phone"]);
  assert.deepEqual(contactFields(schema("mobile-number")), ["mobile-number"]);
  assert.deepEqual(contactFields(schema("telephone", "tel")), ["telephone", "tel"]);
  assert.deepEqual(contactFields(schema("whatsapp")), ["whatsapp"]);
  assert.deepEqual(contactFields(schema("name", "phone", "total", "customerEmail")), [
    "phone",
    "customerEmail",
  ]);
});

test("a word that merely CONTAINS a contact word is not a contact field", () => {
  // "hotelId" contains "tel", "mailingList" contains "mail" — neither is a contact detail.
  assert.deepEqual(contactFields(schema("hotelId", "mailingList", "telemetry", "phonetics")), []);
  assert.deepEqual(contactFields(schema("name", "price", "inStock")), []);
});

test("a missing, empty or junk schema holds no contact fields (never a throw)", () => {
  assert.deepEqual(contactFields(undefined), []);
  assert.deepEqual(contactFields(null), []);
  assert.deepEqual(contactFields("junk"), []);
  assert.deepEqual(contactFields({}), []);
  assert.deepEqual(contactFields({ properties: null }), []);
  assert.deepEqual(contactFields({ properties: ["email"] }), []);
});

test("the notice names the fields and the consent rule; no contact fields = no notice", () => {
  assert.equal(contactRecordsNotice([]), null);
  const notice = contactRecordsNotice(["phone", "customerEmail"]);
  assert.match(notice, /phone, customerEmail/);
  assert.match(notice, /may NOT be marketed to/);
  assert.match(notice, /marketingConsent field set true/);
  assert.match(notice, /answer or fulfil each person's OWN request/);
});

test("list_entity_records declares the notice and derives it best-effort", () => {
  assert.match(source, /notice: z\.string\(\)\.optional\(\)/);
  assert.match(source, /contactRecordsNotice\(await entityContactFields\(/);
  // A failed definition read degrades to no notice, never to a failed peek.
  assert.match(source, /catch \{\n {4}return \[\];/);
});

test("define_entity and the contract carry the marketingConsent convention", () => {
  assert.match(source, /boolean marketingConsent field/);
  assert.match(source, /SERVICE-ONLY/);
  assert.match(doc, /\*\*`marketingConsent`\*\*/);
  assert.match(doc, /Say where it goes BEFORE collecting/);
  assert.match(doc, /the list is service-only/);
});
