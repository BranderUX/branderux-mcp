/**
 * The per-element ACTIONS CONTRACT for agents wiring `actionHandlers` — names,
 * meaning, item shape, and a concrete example item. Wiring is DERIVED from
 * code + propsSchema with the same rules as the BranderUX runtime
 * (`deriveElementInteraction`) — stored interactionPropName fields are legacy
 * and are NOT trusted (they under-report named actions on agent-authored
 * elements).
 */

const PRIMARY_ACTION_CANDIDATES = [
  "onSelect",
  "onItemSelect",
  "onRowClick",
  "onItemClick",
  "onCardClick",
  "onOpen",
  "onView",
  "onClick",
  "onPress",
];

const PRIMARY_ACTION_PATTERN = /select|click|open|view|press/i;
const RIGHT_CLICK_NAME = /contextmenu|rightclick/i;
const LEGACY_SHIM_NAMES = new Set(["onAction", "onItemRightClick", "onItemContextMenu"]);

function callbackPropsFromCode(code: string): string[] {
  const opener = code.match(/export\s+interface\s+Props\s*\{/);
  if (!opener || opener.index === undefined) return [];
  const start = opener.index + opener[0].length;
  let depth = 1;
  let end = start;
  while (end < code.length && depth > 0) {
    if (code[end] === "{") depth += 1;
    else if (code[end] === "}") depth -= 1;
    end += 1;
  }
  const body = code.slice(start, end - 1);
  const names: string[] = [];
  const entry = /(?:^|\n)\s*(on[A-Z]\w*)\s*\??\s*:\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = entry.exec(body)) !== null) {
    names.push(match[1] as string);
  }
  return names;
}

function schemaCallbackNames(propsSchema: Record<string, unknown> | null): string[] {
  const properties = (propsSchema as { properties?: Record<string, unknown> } | null)?.properties;
  return properties ? Object.keys(properties).filter((key) => /^on[A-Z]/.test(key)) : [];
}

export interface DerivedInteraction {
  actionProp: string | null;
  extraActionProps: string[];
}

/** Same derivation rules as the runtime — primary + every other on* (context menus excluded). */
export function deriveInteraction(
  code: string,
  propsSchema: Record<string, unknown> | null,
): DerivedInteraction {
  const declared = [
    ...new Set([...callbackPropsFromCode(code), ...schemaCallbackNames(propsSchema)]),
  ].filter((name) => /^on[A-Z]/.test(name) && !LEGACY_SHIM_NAMES.has(name));
  const rightClickProp = declared.find((name) => RIGHT_CLICK_NAME.test(name)) ?? null;
  const actionable = declared.filter((name) => name !== rightClickProp);
  const actionProp =
    PRIMARY_ACTION_CANDIDATES.find((candidate) => actionable.includes(candidate)) ??
    actionable.find((name) => PRIMARY_ACTION_PATTERN.test(name)) ??
    (actionable.length === 1 ? (actionable[0] ?? null) : null);
  const extraActionProps = actionable.filter(
    (name) => name !== actionProp && !RIGHT_CLICK_NAME.test(name),
  );
  return { actionProp, extraActionProps };
}

interface TemplateSpec {
  primary: string | null;
  actions: Record<string, string>;
}

function parseTemplateSpec(raw: string | null | undefined): TemplateSpec {
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
      /* plain-string template */
    }
  }
  return { primary: trimmed, actions: {} };
}

/**
 * VERBATIM port of the runtime's resolveClickQueryTemplate semantics
 * (lib/elements/click-query.ts): {curly} tokens only — [bracket] text stays
 * literal, exactly as the runtime would send it; missing/null/object values
 * drop; whitespace collapses; an empty result means "no meaning from the
 * template" (caller falls back to the humanized name).
 */
function resolveTokens(template: string, payload: Record<string, unknown>): string {
  return template
    .replace(/\{(\w+)\}/g, (_match, token: string) => {
      const value = payload[token];
      if (value === undefined || value === null || typeof value === "object") return "";
      return String(value);
    })
    .replace(/\s+/g, " ")
    .trim();
}

function humanize(action: string): string {
  const words = action
    .replace(/^on/, "")
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The clicked-item convention: the FIRST array-of-objects prop in defaultProps
 * is the items source; a callback receives one of its entries. When no such
 * prop exists the callback passes primitives (wrapped as { userInput }) or
 * the element's own props.
 */
function findItemsProp(defaultProps: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(defaultProps)) {
    if (
      Array.isArray(value) &&
      value.length > 0 &&
      typeof value[0] === "object" &&
      value[0] !== null
    ) {
      return key;
    }
  }
  return null;
}

export interface ElementActionContract {
  name: string;
  /**
   * Ready-to-paste key targeting ONLY this element ("custom:<key>.onAction").
   * Use it when the same action name exists on several elements — a bare
   * `actions[].name` key is a catch-all that fires for all of them, and a
   * scoped match wins over the bare name (SDK 0.5.1+).
   */
  scopedKey: string | null;
  kind: "primary" | "named";
  meaning: string;
  itemShape: Record<string, unknown> | null;
  exampleItem: Record<string, unknown> | null;
  queryTemplate: string | null;
}

export interface ActionsContractInput {
  code: string;
  propsSchema: Record<string, unknown> | null;
  defaultProps: Record<string, unknown> | null;
  clickQueryTemplate: string | null;
  /** Server `element_key` (runtime id = `custom:<elementKey>`); null on legacy rows without one. */
  elementKey: string | null;
}

/** Assemble the full actions contract for one element version. */
export function buildActionsContract(input: ActionsContractInput): ElementActionContract[] {
  const { actionProp, extraActionProps } = deriveInteraction(input.code, input.propsSchema);
  const names = [
    ...(actionProp ? [{ name: actionProp, kind: "primary" as const }] : []),
    ...extraActionProps.map((name) => ({ name, kind: "named" as const })),
  ];
  if (names.length === 0) return [];

  const spec = parseTemplateSpec(input.clickQueryTemplate);
  const defaults = input.defaultProps ?? {};
  const itemsProp = findItemsProp(defaults);
  const exampleItem = itemsProp
    ? ((defaults[itemsProp] as Record<string, unknown>[])[0] ?? null)
    : null;
  const properties = (input.propsSchema as { properties?: Record<string, unknown> } | null)
    ?.properties;
  const itemsSchema = itemsProp
    ? ((properties?.[itemsProp] as { items?: Record<string, unknown> } | undefined)?.items ?? null)
    : null;

  return names.map(({ name, kind }) => {
    const template = kind === "primary" ? spec.primary : (spec.actions[name] ?? null);
    const payload = exampleItem ?? {};
    const resolved = template ? resolveTokens(template, payload) : "";
    let meaning = resolved;
    if (!meaning) {
      // Same fallback shape as the runtime's generic click query.
      const subject = payload.name ?? payload.title ?? payload.label ?? payload.id;
      meaning = subject === undefined ? humanize(name) : `${humanize(name)}: ${String(subject)}`;
    }
    return {
      name,
      scopedKey: input.elementKey ? `custom:${input.elementKey}.${name}` : null,
      kind,
      meaning,
      itemShape: itemsSchema,
      exampleItem,
      queryTemplate: template,
    };
  });
}
