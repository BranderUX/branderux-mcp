import { transform } from "sucrase";

/**
 * Server-side prep for the element-preview MCP App: the element's TSX is compiled
 * to CommonJS here (same sucrase pipeline as pre-flight validation, plus the
 * `imports` transform) so the app only evaluates — it never parses TypeScript.
 */

export interface PreviewPayload {
  name: string;
  version?: number;
  compiledCode: string;
  defaultProps: Record<string, unknown>;
  clickQueryTemplate: string | null;
  interactionPropName: string | null;
  callbackNames: string[];
  /** The on*ContextMenu prop, when wired — preview opens the action menu on right-click. */
  contextMenuPropName?: string | null;
  /** Normalized project brand — the preview themes the element with it. */
  brandSettings?: Record<string, unknown>;
}

export function compileForPreview(code: string): string {
  return transform(code, {
    transforms: ["typescript", "jsx", "imports"],
    jsxRuntime: "automatic",
    production: true,
  }).code;
}

/**
 * Callback props the preview should shim. Precise sources only — the optional
 * `onX?:` fields of the Props interface (the contract mandates that shape), the
 * declared primary action, and any named actions in a JSON template map.
 */
export function extractCallbackNames(
  code: string,
  interactionPropName: string | null,
  clickQueryTemplate: string | null,
): string[] {
  const names = new Set<string>();
  for (const match of code.matchAll(/\b(on[A-Z][A-Za-z0-9]*)\s*\?\s*:/g)) {
    names.add(match[1]!);
  }
  for (const name of [...names]) {
    if (/ContextMenu$/.test(name)) names.delete(name);
  }
  if (interactionPropName) names.add(interactionPropName);
  if (clickQueryTemplate?.trim().startsWith("{")) {
    try {
      for (const key of Object.keys(
        JSON.parse(clickQueryTemplate) as Record<string, unknown>,
      )) {
        if (key.startsWith("on")) names.add(key);
      }
    } catch {
      /* plain-string template */
    }
  }
  return [...names];
}

/**
 * Origins of https URLs referenced in demo props, so the per-response CSP can
 * allow the element's images. Capped — a preview needs its media, not a CDN list.
 */
export function extractImageOrigins(value: unknown, cap = 10): string[] {
  const origins = new Set<string>();
  const walk = (node: unknown): void => {
    if (origins.size >= cap) return;
    if (typeof node === "string") {
      if (node.startsWith("https://")) {
        try {
          origins.add(new URL(node).origin);
        } catch {
          /* not a URL */
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      Object.values(node).forEach(walk);
    }
  };
  walk(value);
  return [...origins];
}

export interface PreviewSource {
  name: string;
  version?: number;
  code: string;
  defaultProps?: Record<string, unknown>;
  clickQueryTemplate?: string | null;
  interactionPropName?: string | null;
}

/** Null when the code does not compile — callers degrade to a no-preview result. */
export function buildPreviewPayload(
  source: PreviewSource,
): PreviewPayload | null {
  try {
    const compiledCode = compileForPreview(source.code);
    return {
      name: source.name,
      version: source.version,
      compiledCode,
      defaultProps: source.defaultProps ?? {},
      clickQueryTemplate: source.clickQueryTemplate ?? null,
      interactionPropName: source.interactionPropName ?? null,
      callbackNames: extractCallbackNames(
        source.code,
        source.interactionPropName ?? null,
        source.clickQueryTemplate ?? null,
      ),
      contextMenuPropName: (source.code.match(
        /\b(on[A-Z][A-Za-z0-9]*ContextMenu)\s*\?\s*:/,
      ) ?? [null, null])[1],
    };
  } catch {
    return null;
  }
}
