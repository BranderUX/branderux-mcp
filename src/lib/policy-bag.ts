/**
 * The hosted-agent policy bag (`policies`) is stored whole by the server: a
 * PUT with `{policies: {entityLabels}}` would silently drop the language
 * lock, the handoff email, the write policies and the login rule. The upsert
 * tool therefore merges a patch over the stored bag, one level deep — send
 * only what changes; a key set to `null` is removed.
 */
export function mergePolicyBag(
  current: unknown,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const base = isPlainObject(current) ? current : {};
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
