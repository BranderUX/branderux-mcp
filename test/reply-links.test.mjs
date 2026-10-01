// Reply links the owner sends from their own WhatsApp or mail app (owner-data
// build SPEC 2.6): the Israeli number rules, the drafted first line, the
// mailto guard that refuses an address which could add a recipient or a
// header, and the encoding of Hebrew and of `&`, `?` and newlines. The vector
// tables are the SAME ones Spring's PhoneNumbers and the web app's
// reply-links test run, so the three implementations cannot drift. Then the
// reply_links tool itself. Dependency-free (node:test) like its siblings.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  draftEmailBody,
  draftEmailSubject,
  draftFirstLine,
  draftName,
  isHebrewLanguage,
  mailtoLink,
  telLink,
  whatsappDigits,
  whatsappLink,
} from "../dist/lib/reply-links.js";
import { PROJECT, RECORD, callTool, fakeApi, registerAll, springAnswer } from "./owner-data-fixtures.mjs";

test("whatsappDigits: the shared vectors", () => {
  const vectors = [
    ["054-123-4567", "972541234567"],
    ["0541234567", "972541234567"],
    ["+972 54 123 4567", "972541234567"],
    ["972541234567", "972541234567"],
    ["00972541234567", "972541234567"],
    ["+972 (0)54-123-4567", "972541234567"],
    ["541234567", "972541234567"],
    ["03-1234567", "97231234567"],
    ["+1 (415) 555-0100", "14155550100"],
    ["4155550100", null],
    ["12345", null],
    ["", null],
    ["abc", null],
  ];
  for (const [input, expected] of vectors) {
    assert.equal(whatsappDigits(input), expected, JSON.stringify(input));
  }
});

test("whatsappDigits: the edges of each rule", () => {
  assert.equal(whatsappDigits("   "), null, "blank");
  assert.equal(whatsappDigits(null), null);
  assert.equal(whatsappDigits(541234567), null, "a number that is not text");
  assert.equal(whatsappDigits(" 054 123 4567 "), "972541234567", "trimmed");
  assert.equal(whatsappDigits("+1234567"), null, "a plus number shorter than 8 digits");
  assert.equal(whatsappDigits("+12345678"), "12345678", "8 digits after a plus");
  assert.equal(whatsappDigits("+1234567890123456"), null, "more than 15 digits");
  assert.equal(whatsappDigits("97254123456789"), null, "972 with too many digits and no plus");
  assert.equal(whatsappDigits("97231234567"), "97231234567", "972 and 11 digits");
  assert.equal(whatsappDigits("0412345678901"), null, "a leading zero with too many digits");
  assert.equal(whatsappDigits("412345678"), null, "nine digits not starting with 5");
});

test("telLink: the normalised number, else its bare digits, else none", () => {
  assert.equal(telLink("054-1234567"), "tel:+972541234567");
  assert.equal(telLink("12345"), "tel:12345");
  assert.equal(telLink("call me"), null);
  assert.equal(telLink(undefined), null);
});

test("mailtoLink: the shared vectors, and nothing that could add a recipient or a header", () => {
  assert.equal(mailtoLink("dana@example.com", "Hi", "Line"), "mailto:dana@example.com?subject=Hi&body=Line");
  assert.equal(mailtoLink("me@x.example?cc=spy@evil.example&", "Hi", "x"), null);
  assert.equal(mailtoLink("a b@x.co", "Hi", "x"), null);
  assert.equal(mailtoLink('"x"@evil.example', "Hi", "x"), null);
  for (const address of [
    // A header or a second parameter smuggled in with no second "@" (the subject or body overridden).
    "dana@example.com?subject=You won",
    "dana@example.com?body=Send your card number",
    "dana@example.com&body=x",
    "dana?x@example.com",
    "dana@example.com,spy@evil.example",
    "dana@example.com;spy@evil.example",
    "dana@example.com&bcc=spy@evil.example",
    "dana%40example.com@x.example",
    "<dana@example.com>",
    "dana(comment)@example.com",
    "dana\\@example.com",
    "dana@localhost",
    "no-at-sign.example.com",
    `${"a".repeat(250)}@x.co`,
    null,
  ]) {
    assert.equal(mailtoLink(address, "Hi", "x"), null, String(address));
  }
  assert.equal(mailtoLink("  dana@example.com  ", "Hi", "x"), "mailto:dana@example.com?subject=Hi&body=x", "trimmed");
});

test("wa.me and mailto encode Hebrew, &, ? and newlines in the text", () => {
  const text = "שלום דנה & תודה?\nשורה שנייה";
  const wa = whatsappLink("972541234567", text);
  assert.ok(wa.startsWith("https://wa.me/972541234567?text="));
  const encoded = wa.slice("https://wa.me/972541234567?text=".length);
  assert.doesNotMatch(encoded, /[&?\n ]/, "no raw separator survives in the text");
  assert.match(encoded, /%26/);
  assert.match(encoded, /%3F/);
  assert.match(encoded, /%0A/);
  assert.equal(decodeURIComponent(encoded), text, "it reads back exactly");
  assert.equal(new URL(wa).searchParams.get("text"), text);

  const mail = mailtoLink("dana@example.com", "הפנייה שלך אל Cook & Bake?", text);
  const [, query] = mail.split("?");
  assert.deepEqual(query.split("&").map((part) => part.split("=")[0]), ["subject", "body"], "exactly two parameters");
  const params = new URLSearchParams(mail.slice(mail.indexOf("?") + 1));
  assert.equal(params.get("subject"), "הפנייה שלך אל Cook & Bake?");
  assert.equal(params.get("body"), text);
});

test("the drafted first line: the name rule and both languages", () => {
  assert.equal(draftName("Dana Levi"), "Dana");
  assert.equal(draftName("דנה לוי"), "דנה");
  assert.equal(draftName("O'Brien"), "O'Brien");
  assert.equal(draftName("Jean-Luc Picard"), "Jean-Luc");
  assert.equal(draftName("צ׳רלי"), "צ׳רלי");
  assert.equal(draftName("Dana123"), null);
  assert.equal(draftName("a".repeat(31)), null, "a 31-letter word");
  assert.equal(draftName("a".repeat(30)), "a".repeat(30));
  assert.equal(draftName("   "), null, "a blank name");
  assert.equal(draftName(null), null);

  assert.equal(draftFirstLine("en", "Dana Levi", "Cook & Bake"), "Hi Dana, this is Cook & Bake about your request.");
  assert.equal(draftFirstLine("en", "Dana123", "Cook & Bake"), "Hi, this is Cook & Bake about your request.");
  assert.equal(draftFirstLine("he", "דנה לוי", "קוק אנד בייק"), "שלום דנה, כאן קוק אנד בייק בנוגע לפנייה שלך.");
  assert.equal(draftFirstLine("he", "", "קוק אנד בייק"), "שלום, כאן קוק אנד בייק בנוגע לפנייה שלך.");
  assert.equal(draftFirstLine("en", "Dana", null), "Hi Dana, this is your site about your request.", "the fallback name");
  assert.equal(draftFirstLine("he", "דנה", "  "), "שלום דנה, כאן האתר שלך בנוגע לפנייה שלך.");

  assert.equal(draftEmailSubject("en", "Cook & Bake"), "Your request with Cook & Bake");
  assert.equal(draftEmailSubject("he", "Cook & Bake"), "הפנייה שלך אל Cook & Bake");
  assert.equal(draftEmailBody("en", "Dana Levi", "Cook & Bake"), "Hi Dana, this is Cook & Bake about your request.\n\n");
});

test("the site language reads as Hebrew by tag or by name, otherwise English", () => {
  for (const language of ["he", "HE", "he-IL", "iw", "Hebrew", " hebrew ", "עברית"]) {
    assert.equal(isHebrewLanguage(language), true, language);
  }
  for (const language of ["en", "ar", "fr", "", null, undefined]) {
    assert.equal(isHebrewLanguage(language), false, String(language));
  }
});

// --- the tool --------------------------------------------------------------

/** reply_links against a record whose person is `who` on a site in `language`. */
async function replyFor(who, { language = "he", subject, message = "שלום דנה, השולחן שמור." } = {}) {
  const api = fakeApi((method, path) => {
    const answer = springAnswer(method, path);
    answer.record.who = who;
    answer.site = { name: "Cook & Bake", language };
    return answer;
  });
  const result = await callTool(registerAll(api), "reply_links", {
    projectId: PROJECT,
    recordId: RECORD,
    message,
    ...(subject === undefined ? {} : { subject }),
  });
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  return result.structuredContent;
}

test("reply_links: an Israeli local number and an email become the owner's two links", async () => {
  const message = "שלום דנה, השולחן שמור לשישי & תודה?";
  const links = await replyFor({ name: "Dana Levi", phone: "054-1234567", email: "dana@example.com" }, { message });
  assert.equal(links.recordId, RECORD);
  assert.equal(links.whatsapp, whatsappLink("972541234567", message));
  assert.equal(links.phone, "+972541234567");
  assert.equal(links.email, mailtoLink("dana@example.com", "הפנייה שלך אל Cook & Bake", message));
  assert.equal(
    links.note,
    "Open one of these on the owner's device; they send from their own WhatsApp or mail app. After they confirm it went out, call update_record_workflow with contactedVia."
  );
});

test("reply_links: the subject is the AI's when given, the site's default in English otherwise", async () => {
  const custom = await replyFor({ email: "dana@example.com" }, { subject: "Your table on Friday", message: "Hi" });
  assert.equal(custom.email, "mailto:dana@example.com?subject=Your%20table%20on%20Friday&body=Hi");
  const english = await replyFor({ email: "dana@example.com" }, { language: "en", message: "Hi" });
  assert.equal(english.email, "mailto:dana@example.com?subject=Your%20request%20with%20Cook%20%26%20Bake&body=Hi");
  assert.equal(english.whatsapp, null, "no phone, no WhatsApp link");
  assert.equal(english.phone, null);
});

test("reply_links: an unreadable number and a refused address give no links and say so", async () => {
  const none = await replyFor({ name: "Dana", phone: "4155550100", email: "me@x.example?cc=spy@evil.example" });
  assert.equal(none.whatsapp, null);
  assert.equal(none.phone, null);
  assert.equal(none.email, null);
  assert.equal(none.note, "This record has no phone number or email address to reply to.");
  const empty = await replyFor({ name: null, phone: null, email: null });
  assert.equal(empty.note, "This record has no phone number or email address to reply to.");
});
