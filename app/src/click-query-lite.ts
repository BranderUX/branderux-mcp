/**
 * Minimal port of the click-query template semantics (lib/elements/click-query.ts):
 * the stored template is either a plain string (= primary action) or a JSON map
 * {"$primary": "...", "onAddToCart": "..."} with {field} tokens resolved against
 * the callback's payload object. Primitive callback args become { userInput }.
 */

interface TemplateSpec {
  primary: string | null;
  actions: Record<string, string>;
}

export function parseTemplateSpec(raw: string | null | undefined): TemplateSpec {
  if (!raw) return { primary: null, actions: {} };
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const actions: Record<string, string> = {};
      let primary: string | null = null;
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== "string") continue;
        if (key === "$primary") primary = value;
        else actions[key] = value;
      }
      return { primary, actions };
    } catch {
      /* fall through: treat as a plain-string template */
    }
  }
  return { primary: trimmed, actions: {} };
}

function resolveTokens(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{([A-Za-z0-9_.]+)\}/g, (_, token: string) => {
    const value = payload[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** "onAddToCart" → "Add to cart" */
function humanize(action: string): string {
  const words = action.replace(/^on/, "").replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Resolve the query a callback invocation would send. `isPrimary` selects the
 * primary template; named actions use their own entry, else a readable fallback.
 */
export function resolveActionQuery(
  action: string,
  isPrimary: boolean,
  spec: TemplateSpec,
  args: unknown[]
): string {
  const first = args[0];
  const payload: Record<string, unknown> =
    first !== null && typeof first === "object"
      ? (first as Record<string, unknown>)
      : { userInput: first };

  const template = isPrimary ? (spec.primary ?? spec.actions[action]) : spec.actions[action];
  if (template) return resolveTokens(template, payload);

  const subject = payload.name ?? payload.title ?? payload.label ?? payload.userInput ?? payload.id;
  return subject === undefined ? humanize(action) : `${humanize(action)}: ${String(subject)}`;
}
