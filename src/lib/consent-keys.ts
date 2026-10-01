/**
 * The marketing-consent keys of a record (owner-data build, SPEC 2.7). The
 * visitor answers `marketingConsent`; Spring stamps the evidence beside it
 * (the wording and the time of a yes, the time of a withdrawal).
 */

/** The evidence Spring stamps itself; no schema may declare these and no one else writes them. */
export const CONSENT_EVIDENCE_KEYS = [
  "marketingConsentText",
  "marketingConsentAt",
  "marketingConsentWithdrawnAt",
] as const;

/** Every key only the customer's own answer may write. */
export const CONSENT_KEYS: readonly string[] = ["marketingConsent", ...CONSENT_EVIDENCE_KEYS];

/**
 * Why an owner-side change (update_record, correct_record) may not carry
 * these fields, or null when it may. A yes can only come from the customer,
 * and on these paths the server treats a no as an opt-out, which belongs to
 * record_opt_out and its confirm step: a sentence planted in a form field
 * must never opt a person out without the owner's approval. Checked before
 * any API call, so a refused change changes nothing.
 */
export function consentKeyRefusal(tool: string, fields: Record<string, unknown>): string | null {
  const key = Object.keys(fields).find((name) => CONSENT_KEYS.includes(name));
  return key
    ? `Marketing consent can't be changed with ${tool}: only the customer can agree to marketing, and an ` +
        `opt-out goes through record_opt_out. Remove ${key} and try again.`
    : null;
}
