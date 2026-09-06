/**
 * Text direction of a hosted site from `policies.language` (a BCP-47 tag such
 * as "he", or a name such as "Hebrew"). Mirrors the client's lib/i18n rule at
 * the size the panels need: RTL when the primary language is one of the
 * right-to-left languages; everything else, including unknown values, is LTR.
 */

const RTL_LANGUAGES = new Set([
  "ar",
  "he",
  "fa",
  "ur",
  "ps",
  "sd",
  "ug",
  "yi",
  "ckb",
  "dv",
  "syr",
  "nqo",
]);

const RTL_NAMES = new Set([
  "arabic",
  "العربية",
  "hebrew",
  "עברית",
  "persian",
  "farsi",
  "فارسی",
  "urdu",
  "اردو",
  "pashto",
  "yiddish",
  "ייִדיש",
  "kurdish",
]);

export type SiteDirection = "ltr" | "rtl";

export function siteDirection(language: unknown): SiteDirection {
  if (typeof language !== "string") return "ltr";
  const value = language.trim().toLowerCase();
  if (!value) return "ltr";
  if (RTL_NAMES.has(value)) return "rtl";
  const primary = value.split(/[-_]/)[0] ?? value;
  return RTL_LANGUAGES.has(primary) ? "rtl" : "ltr";
}

/** The project's language as stored, or undefined when no hosted agent / no language. */
export function siteLanguage(config: { policies?: Record<string, unknown> } | null | undefined): string | undefined {
  const raw = config?.policies?.language;
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 40) : undefined;
}
