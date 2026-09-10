import { isPlainObject } from "./policy-bag.js";

/**
 * Which entity fields hold a PERSON'S CONTACT DETAILS, read from the entity
 * definition's `jsonSchema` property names — the definition is the only place
 * that promises them (an intake entity holds contact fields from the moment it
 * is defined, before a single row exists).
 *
 * Why it matters on a READ: contact details a business collects to serve
 * someone may not be marketed to without that person's recorded consent (the
 * Communications Law's spam rule; the convention is a `marketingConsent`
 * boolean on the row — see hosted-agent-contract). So a peek at such an entity
 * carries the notice with the rows, where the agent reading them sees it.
 */
const CONTACT_WORDS = new Set([
  "email",
  "emails",
  "phone",
  "phones",
  "telephone",
  "tel",
  "cellphone",
  "whatsapp",
  // Hebrew — the product is Hebrew-first, and a Hebrew site's intake fields are
  // named in Hebrew. `דואר` rides because `דואר_אלקטרוני` (email) splits into
  // two words; unlike English "mail" it is not used as a qualifier in field
  // names, and a postal-address field matching it is a contact detail anyway.
  "טלפון",
  "נייד",
  "פלאפון",
  "אימייל",
  "מייל",
  "דואל",
  "דואר",
  "וואטסאפ",
  "ווצאפ",
]);

/**
 * `mobile` is a contact detail only where it names a PHONE — `mobile`,
 * `mobileNumber`, `customerMobile`. Everywhere else it describes a device:
 * `mobileApp`, `mobileFriendly`, `isMobile`. So it counts as a phone only in
 * NOUN position (last word, or followed by a number word), and never inside a
 * boolean-flag name. Bare "mail" and "cell" are deliberately absent from
 * CONTACT_WORDS for the same reason (`mailOrder`, `cellType`, `cellCount`);
 * `email` and `cellphone` carry those cases.
 */
const PHONE_NOUN_WORDS = new Set(["mobile"]);
const NUMBER_WORDS = new Set(["number", "num", "no", "nr"]);
const FLAG_PREFIXES = new Set(["is", "has"]);

/**
 * camelCase, snake_case and kebab-case all reduce to the same lowercase words.
 * The split is UNICODE: an ASCII-only separator class would swallow every
 * Hebrew (or Arabic, or Cyrillic) property name whole and find no words in it.
 */
function words(name: string): string[] {
  return name
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}

/** Does this property name promise a person's contact detail? */
function isContactName(name: string): boolean {
  const parts = words(name);
  if (parts.length === 0 || FLAG_PREFIXES.has(parts[0])) return false;
  return parts.some(
    (word, index) =>
      CONTACT_WORDS.has(word) ||
      (PHONE_NOUN_WORDS.has(word) &&
        (index === parts.length - 1 || NUMBER_WORDS.has(parts[index + 1])))
  );
}

/** The contact-bearing property names of an entity schema (empty = none). */
export function contactFields(jsonSchema: unknown): string[] {
  if (!isPlainObject(jsonSchema)) return [];
  const properties = jsonSchema.properties;
  if (!isPlainObject(properties)) return [];
  return Object.keys(properties).filter(isContactName);
}

/** The notice that rides a records read of a contact-holding entity; null when there is none. */
export function contactRecordsNotice(fields: string[]): string | null {
  if (fields.length === 0) return null;
  return (
    `These rows hold contact details (${fields.join(", ")}). They may be used to answer or ` +
    `fulfil each person's OWN request, but this list may NOT be marketed to — no offers, ` +
    `newsletters, campaigns or bulk messages — unless the row records that person's consent ` +
    `(a marketingConsent field set true). Never export or reuse them for marketing without it.`
  );
}
