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
import { registerAgentTools } from "../dist/tools/agent.js";

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

test("Hebrew property names count — the product is Hebrew-first", () => {
  assert.deepEqual(contactFields(schema("טלפון")), ["טלפון"]);
  assert.deepEqual(contactFields(schema("אימייל")), ["אימייל"]);
  assert.deepEqual(contactFields(schema("דואר_אלקטרוני")), ["דואר_אלקטרוני"]);
  assert.deepEqual(contactFields(schema("מספר_נייד")), ["מספר_נייד"]);
  assert.deepEqual(contactFields(schema("פלאפון", "וואטסאפ")), ["פלאפון", "וואטסאפ"]);
  assert.deepEqual(contactFields(schema("שם", "כתובת", "מייל")), ["מייל"]);
  assert.deepEqual(contactFields(schema("שם", "כמות", "מחיר")), []);
});

test("a word that merely CONTAINS a contact word is not a contact field", () => {
  // "hotelId" contains "tel", "mailingList" contains "mail" — neither is a contact detail.
  assert.deepEqual(contactFields(schema("hotelId", "mailingList", "telemetry", "phonetics")), []);
  assert.deepEqual(contactFields(schema("name", "price", "inStock")), []);
});

test("a word that merely SHARES a stem with a contact word is not one either", () => {
  // "mail" and "cell" alone are not contact details; "mobile" is one only as a phone noun.
  assert.deepEqual(contactFields(schema("mailOrder", "cellType", "cellCount")), []);
  assert.deepEqual(contactFields(schema("mobileApp", "mobileFriendly", "isMobile")), []);
  assert.deepEqual(contactFields(schema("hasPhone", "isEmailVerified")), []);
  // …while the phone-noun shapes still count.
  assert.deepEqual(contactFields(schema("mobile", "customerMobile", "mobileNo", "cellphone")), [
    "mobile",
    "customerMobile",
    "mobileNo",
    "cellphone",
  ]);
});

test("a missing, empty or junk schema holds no contact fields (never a throw)", () => {
  assert.deepEqual(contactFields(undefined), []);
  assert.deepEqual(contactFields(null), []);
  assert.deepEqual(contactFields("junk"), []);
  assert.deepEqual(contactFields({}), []);
  assert.deepEqual(contactFields({ properties: null }), []);
  assert.deepEqual(contactFields({ properties: ["email"] }), []);
  assert.deepEqual(contactFields({ properties: { "": {}, "—": {} } }), []);
});

test("the notice names the fields and the consent rule; no contact fields = no notice", () => {
  assert.equal(contactRecordsNotice([]), null);
  const notice = contactRecordsNotice(["phone", "customerEmail"]);
  assert.match(notice, /phone, customerEmail/);
  assert.match(notice, /may NOT be marketed to/);
  assert.match(notice, /marketingConsent field set true/);
  assert.match(notice, /answer or fulfil each person's OWN request/);
});

const PROJECT = "8f1c2a24-0d3b-4b31-9c0e-5a7e6f1b2c34";
const ROWS = [{ _id: "0f0e0d0c-0b0a-4908-8706-050403020100", phone: "+972501234567" }];

/** A fake ApiClient: the `/entities` path answers definitions, the records path rows. */
function fakeApi({ entities = [], entitiesThrow = false } = {}) {
  const calls = [];
  return {
    calls,
    get: async (path) => {
      calls.push(path);
      if (path.endsWith("/entities")) {
        if (entitiesThrow) throw new Error("definition lookup failed");
        return entities;
      }
      return { rows: ROWS, count: ROWS.length };
    },
  };
}

/** Register the agent tools on a fake McpServer and hand back list_entity_records. */
function listEntityRecords(api) {
  const tools = new Map();
  registerAgentTools(
    { registerTool: (name, config, handler) => tools.set(name, { config, handler }) },
    api
  );
  const tool = tools.get("list_entity_records");
  assert.ok(tool, "list_entity_records is registered");
  return tool;
}

const peek = (api) =>
  listEntityRecords(api).handler({ projectId: PROJECT, entityName: "enquiries" });

test("list_entity_records declares an OPTIONAL notice and rides it for a contact-holding entity", async () => {
  const api = fakeApi({
    entities: [
      { name: "products", jsonSchema: schema("title", "price") },
      { name: "enquiries", jsonSchema: schema("name", "phone") },
    ],
  });
  const { config } = listEntityRecords(api);
  assert.equal(config.outputSchema.notice.safeParse(undefined).success, true, "notice is optional");
  assert.equal(config.outputSchema.notice.safeParse("a notice").success, true, "notice is a string");

  const result = await peek(api);
  assert.notEqual(result.isError, true);
  assert.deepEqual(result.structuredContent.rows, ROWS);
  assert.match(result.structuredContent.notice, /contact details \(phone\)/);
});

test("an entity with no contact fields carries no notice at all", async () => {
  const api = fakeApi({ entities: [{ name: "enquiries", jsonSchema: schema("name", "total") }] });
  const result = await peek(api);
  assert.equal("notice" in result.structuredContent, false);
});

test("a failed definition lookup degrades to no notice — never to a failed peek", async () => {
  const api = fakeApi({ entitiesThrow: true });
  const result = await peek(api);
  assert.notEqual(result.isError, true, "the peek still answers");
  assert.deepEqual(result.structuredContent.rows, ROWS);
  assert.equal("notice" in result.structuredContent, false);
});

test("an unknown entity name (no definition) carries no notice", async () => {
  const api = fakeApi({ entities: [{ name: "products", jsonSchema: schema("title", "email") }] });
  const result = await peek(api);
  assert.equal("notice" in result.structuredContent, false);
});

test("define_entity and the contract carry the marketingConsent convention", () => {
  assert.match(source, /boolean marketingConsent field/);
  assert.match(source, /SERVICE-ONLY/);
  assert.match(doc, /\*\*`marketingConsent`\*\*/);
  assert.match(doc, /Say where it goes BEFORE collecting/);
  assert.match(doc, /the list is service-only/);
});
