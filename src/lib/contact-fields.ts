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
  "mail",
  "phone",
  "phones",
  "mobile",
  "telephone",
  "tel",
  "cell",
  "cellphone",
  "whatsapp",
]);

/** camelCase, snake_case and kebab-case all reduce to the same lowercase words. */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .map((word) => word.toLowerCase())
    .filter(Boolean);
}

/** The contact-bearing property names of an entity schema (empty = none). */
export function contactFields(jsonSchema: unknown): string[] {
  if (!isPlainObject(jsonSchema)) return [];
  const properties = jsonSchema.properties;
  if (!isPlainObject(properties)) return [];
  return Object.keys(properties).filter((name) =>
    words(name).some((word) => CONTACT_WORDS.has(word))
  );
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
