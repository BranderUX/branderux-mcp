/**
 * Reply links the OWNER sends: a WhatsApp link and an email link that open
 * the owner's own WhatsApp or mail app with a drafted message. Nothing here
 * sends anything. The same rules live in two other places (Spring's
 * `PhoneNumbers` and the web app's `lib/owner-data/reply-links.ts`) and all
 * three are held to one table of vectors, so an Israeli number normalises the
 * same way in the alert email, the record page and an AI client's draft.
 */

/**
 * The digits WhatsApp's `wa.me` link wants (country code, no plus, no zeros
 * in front), or null when the number cannot be read as a phone number.
 * Israeli local shapes (`054-1234567`, `541234567`, `03-1234567`, a `+972`
 * with the trunk zero kept) are normalised to 972...; any other country
 * needs its `+` or `00` prefix, because a bare foreign number is ambiguous.
 */
export function whatsappDigits(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let plus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    plus = true;
  }
  if (plus) {
    if (digits.startsWith("9720")) digits = `972${digits.slice(4)}`;
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  if (digits.startsWith("972")) {
    if (digits.startsWith("9720")) digits = `972${digits.slice(4)}`;
    return digits.length === 11 || digits.length === 12 ? digits : null;
  }
  if (digits.startsWith("0") && (digits.length === 9 || digits.length === 10)) {
    return `972${digits.slice(1)}`;
  }
  if (digits.length === 9 && digits.startsWith("5")) return `972${digits}`;
  return null;
}

/** A `wa.me` link that opens a chat with `digits` and the text already typed. */
export function whatsappLink(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** A `tel:` link: the normalised number when it reads, else its bare digits, else none. */
export function telLink(raw: unknown): string | null {
  const digits = whatsappDigits(raw);
  if (digits) return `tel:+${digits}`;
  if (typeof raw !== "string") return null;
  const all = raw.replace(/\D/g, "");
  return all ? `tel:${all}` : null;
}

/**
 * The address shape a mailto link may carry: nothing that could end the
 * address and add a recipient or a header (`?cc=`, `&bcc=`, a comma, a quote,
 * a space), so a visitor's typed "email" can never turn the owner's reply
 * into a message to someone else.
 */
const MAILTO_ADDRESS =
  /^[^\s@,;?&%<>"'()\\]+@[^\s@,;?&%<>"'()\\]+\.[^\s@,;?&%<>"'()\\]+$/;

/** A mailto link with the subject and body encoded, or null for an address it refuses. */
export function mailtoLink(address: unknown, subject: string, body: string): string | null {
  if (typeof address !== "string") return null;
  const trimmed = address.trim();
  if (trimmed.length > 254 || !MAILTO_ADDRESS.test(trimmed)) return null;
  return `mailto:${trimmed}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Hebrew when the site language reads as Hebrew (a tag or a name), otherwise English. */
export function isHebrewLanguage(language: unknown): boolean {
  if (typeof language !== "string") return false;
  const value = language.trim().toLowerCase();
  return value.startsWith("he") || value.startsWith("iw") || value === "hebrew" || value === "עברית";
}

/** The business name a draft names, with the plain fallback when none is known. */
function businessName(language: unknown, business: unknown): string {
  if (typeof business === "string" && business.trim()) return business.trim();
  return isHebrewLanguage(language) ? "האתר שלך" : "your site";
}

/** A first name that reads as a name: letters, `-`, `'` or `׳`, at most 30 characters. */
const NAME_WORD = /^[\p{L}'׳-]+$/u;

/** The first word of the person's name when it can open a greeting, else null. */
export function draftName(fullName: unknown): string | null {
  if (typeof fullName !== "string") return null;
  const first = fullName.trim().split(/\s+/u)[0] ?? "";
  if (!first || [...first].length > 30 || !NAME_WORD.test(first)) return null;
  return first;
}

/** The drafted first line of a reply, in the site's language. */
export function draftFirstLine(language: unknown, fullName: unknown, business: unknown): string {
  const name = draftName(fullName);
  const from = businessName(language, business);
  if (isHebrewLanguage(language)) {
    return name ? `שלום ${name}, כאן ${from} בנוגע לפנייה שלך.` : `שלום, כאן ${from} בנוגע לפנייה שלך.`;
  }
  return name ? `Hi ${name}, this is ${from} about your request.` : `Hi, this is ${from} about your request.`;
}

/** The default subject of an email reply, in the site's language. */
export function draftEmailSubject(language: unknown, business: unknown): string {
  const from = businessName(language, business);
  return isHebrewLanguage(language) ? `הפנייה שלך אל ${from}` : `Your request with ${from}`;
}

/** The default body of an email reply: the drafted first line, then a blank line. */
export function draftEmailBody(language: unknown, fullName: unknown, business: unknown): string {
  return `${draftFirstLine(language, fullName, business)}\n\n`;
}
