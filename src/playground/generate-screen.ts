/**
 * generate_screen — THE screen renderer of the builder MCP, replacing the
 * single-project tool from @brander/mcp-tools (which stays correct for
 * customer servers but not here). One tool, two modes:
 *   - with projectId: the REAL project's brand + its published custom elements
 *     (fetched with the caller's token, compiled server-side). Unknown custom
 *     keys fail LOUD with the list of available keys.
 *   - without projectId: the playground — canned demo brand, fixed elements
 *     only, for showing BranderUX output before anything exists.
 * Renders through the universal-renderer resource the playground registers.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import { READ_ONLY, fail, guarded } from "../tools/helpers.js";
import { compileForPreview, extractCallbackNames, extractImageOrigins } from "../preview/compile.js";
import { PLAYGROUND_CONFIG } from "./playground.js";

/** The mcp-tools universal renderer — registered by the playground's registerBranderTools. */
const RENDERER_RESOURCE_URI = "ui://brander/element-renderer";

/**
 * The panel reads nested brand fields unguarded (fontStyle.fontFamily,
 * grayPalette.*) and a crash there blanks the WHOLE panel — it sits above the
 * per-element error boundaries. Projects written before the MCP's brand
 * coercion can carry string/null fontStyle etc., so normalize over full
 * defaults before anything ships to the renderer.
 */
const PANEL_BRAND_DEFAULTS = {
  primaryColor: "#6366F1",
  secondaryColor: "#06B6D4",
  brandName: "Your Brand",
  iconUrl: "",
  fontStyle: { fontFamily: "'Inter', sans-serif", weight: 500, displayName: "modern" },
  layoutStyle: { spacing: 3, elevation: 1, displayName: "clean" },
  borderRadius: 12,
  shadowIntensity: 2,
  darkMode: true,
  accentColor: "#F59E0B",
  grayPalette: {
    gray50: "#FAFAFA",
    gray100: "#F5F5F5",
    gray200: "#E5E5E5",
    gray300: "#D4D4D4",
    gray400: "#A3A3A3",
    gray500: "#737373",
    gray600: "#525252",
    gray700: "#404040",
    gray800: "#262626",
    gray900: "#171717",
  },
  primaryTextColor: "#171717",
  secondaryTextColor: "#525252",
  tertiaryTextColor: "#737373",
};

export function normalizeBrandForPanel(raw: Record<string, unknown>): Record<string, unknown> {
  const font = raw.fontStyle;
  const fontStyle =
    font && typeof font === "object" && typeof (font as { fontFamily?: unknown }).fontFamily === "string"
      ? { ...PANEL_BRAND_DEFAULTS.fontStyle, ...(font as Record<string, unknown>) }
      : typeof font === "string" && font.trim()
        ? { fontFamily: font.includes(",") ? font : `'${font}', sans-serif`, weight: 500, displayName: font }
        : PANEL_BRAND_DEFAULTS.fontStyle;
  const layout = raw.layoutStyle;
  const layoutStyle =
    layout && typeof layout === "object" && typeof (layout as { spacing?: unknown }).spacing === "number"
      ? { ...PANEL_BRAND_DEFAULTS.layoutStyle, ...(layout as Record<string, unknown>) }
      : PANEL_BRAND_DEFAULTS.layoutStyle;
  const grayPalette =
    raw.grayPalette && typeof raw.grayPalette === "object"
      ? { ...PANEL_BRAND_DEFAULTS.grayPalette, ...(raw.grayPalette as Record<string, unknown>) }
      : PANEL_BRAND_DEFAULTS.grayPalette;
  const out: Record<string, unknown> = {
    ...PANEL_BRAND_DEFAULTS,
    ...raw,
    fontStyle,
    layoutStyle,
    grayPalette,
  };
  for (const key of Object.keys(out)) {
    if (out[key] === null) out[key] = (PANEL_BRAND_DEFAULTS as Record<string, unknown>)[key] ?? undefined;
  }
  return out;
}

/** Mirrors the renderer resource's static CSP — per-response CSP replaces, not merges. */
const BASE_MEDIA_DOMAINS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://lh3.googleusercontent.com",
  "https://commondatastorage.googleapis.com",
  "https://storage.googleapis.com",
  "https://images.unsplash.com",
  "https://res.cloudinary.com",
  "https://i.imgur.com",
  "https://img.youtube.com",
];

const FIXED_TYPES = [
  "header",
  "chat-bubble",
  "stats-grid",
  "data-table",
  "line-chart",
  "pie-chart",
  "bar-chart",
  "item-grid",
  "item-card",
  "image",
  "details-data",
  "form",
  "button",
  "alert",
  "video",
] as const;

const elementEntry = z.object({
  elementType: z
    .string()
    .describe(`One of the 15 fixed types (${FIXED_TYPES.join(", ")}) or "custom"`),
  key: z
    .string()
    .optional()
    .describe('Custom element key when elementType is "custom" (from list_elements)'),
  props: z.record(z.unknown()).describe("Props for the element (custom: match its propsSchema)"),
  clickQuery: z
    .string()
    .optional()
    .describe("Query sent when the element is clicked, [placeholder] tokens allowed"),
});

interface WireElement {
  elementKey?: string;
  name?: string;
  currentVersionPayload?: {
    code?: string;
    defaultProps?: Record<string, unknown>;
    clickQueryTemplate?: string | null;
    interactionPropName?: string | null;
  };
}

/** Primary template from the stored spec (plain string, or `$primary` in a JSON map). */
function primaryTemplate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return typeof parsed.$primary === "string" ? parsed.$primary : null;
  } catch {
    return trimmed;
  }
}

export function registerGenerateScreen(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "generate_screen",
    {
      title: "Generate a branded screen",
      description:
        "Render a branded, interactive screen in the panel. WITH projectId: uses that project's " +
        "REAL brand settings and published CUSTOM elements. WITHOUT projectId: playground mode — " +
        "a canned demo brand, fixed elements only, for showing BranderUX output before anything exists. " +
        `Elements: the 15 fixed types (${FIXED_TYPES.join(", ")}) plus ` +
        '{ elementType: "custom", key: "<element-key>", props } for the project\'s own elements — ' +
        "call list_elements first for keys and read each element's propsSchema via get_element. " +
        "To render a SAVED screen: get_screen, then compose the same placements here with realistic " +
        "demo props (custom elements: their defaultProps are a good start). " +
        "Set clickQuery on elements so clicks send follow-up queries.",
      inputSchema: {
        projectId: z
          .string()
          .uuid()
          .optional()
          .describe("Project whose brand + custom elements to render with; omit for playground mode"),
        elements: z.array(elementEntry).min(1),
      },
      outputSchema: {
        elementType: z.string(),
        elements: z.array(z.object({}).passthrough()),
        brandSettings: z.object({}).passthrough(),
        projectSettings: z.object({}).passthrough().optional(),
      },
      annotations: READ_ONLY,
      _meta: {
        ui: { resourceUri: RENDERER_RESOURCE_URI },
        "ui/resourceUri": RENDERER_RESOURCE_URI,
      },
    },
    guarded(async ({ projectId, elements }) => {
      const needsCustom = elements.some((e) => e.elementType === "custom");
      let brandSettings: Record<string, unknown> = normalizeBrandForPanel(
        PLAYGROUND_CONFIG.brandSettings as unknown as Record<string, unknown>
      );
      let projectSettings: Record<string, unknown> = {};
      const byKey = new Map<string, WireElement>();

      if (projectId) {
        const project = await api.get<{
          brandSettings?: Record<string, unknown>;
          settings?: Record<string, unknown>;
        }>(`/projects/${projectId}`);
        if (!project) return fail(`Project ${projectId} not found.`);
        brandSettings = normalizeBrandForPanel(project.brandSettings ?? {});
        projectSettings = project.settings ?? {};
        if (needsCustom) {
          const wire = await api.get<WireElement[]>(`/projects/${projectId}/elements`);
          for (const el of wire ?? []) {
            if (el.elementKey) byKey.set(el.elementKey, el);
          }
        }
      } else if (needsCustom) {
        return fail(
          "Playground mode (no projectId) has no custom elements — pass the projectId whose elements you want to render."
        );
      }

      const screenElements: Record<string, unknown>[] = [];
      for (const entry of elements) {
        if (entry.elementType !== "custom") {
          screenElements.push({
            elementType: entry.elementType,
            props: entry.props,
            clickQuery: entry.clickQuery,
            clickBehavior: { queryTemplate: null, entityName: entry.elementType },
          });
          continue;
        }
        const wire = entry.key ? byKey.get(entry.key) : undefined;
        const payload = wire?.currentVersionPayload;
        if (!wire || !payload?.code) {
          return fail(
            `Custom element key "${entry.key ?? "(missing)"}" not found in project ${projectId ?? "(playground)"}. ` +
              `Available keys: ${[...byKey.keys()].join(", ") || "(none — this project has no published custom elements)"}`
          );
        }
        const clickQueryTemplate = payload.clickQueryTemplate ?? null;
        const interactionPropName = payload.interactionPropName ?? null;
        screenElements.push({
          elementType: "custom",
          props: entry.props,
          clickQuery: entry.clickQuery,
          clickBehavior: {
            queryTemplate: primaryTemplate(clickQueryTemplate),
            entityName: wire.name ?? entry.key,
          },
          customElement: {
            key: wire.elementKey,
            name: wire.name ?? wire.elementKey,
            compiledCode: compileForPreview(payload.code),
            clickQueryTemplate,
            interactionPropName,
            callbackNames: extractCallbackNames(payload.code, interactionPropName, clickQueryTemplate),
          },
        });
      }

      const structuredContent = {
        elementType: "screen",
        elements: screenElements,
        brandSettings,
        projectSettings,
      };

      const imageOrigins = extractImageOrigins(elements.map((e) => e.props)).filter(
        (origin) => !BASE_MEDIA_DOMAINS.includes(origin)
      );
      const meta: Record<string, unknown> = {
        ui: {
          resourceUri: RENDERER_RESOURCE_URI,
          ...(imageOrigins.length > 0
            ? { csp: { resourceDomains: [...BASE_MEDIA_DOMAINS, ...imageOrigins] } }
            : {}),
        },
        "ui/resourceUri": RENDERER_RESOURCE_URI,
      };

      const summary = screenElements
        .map((el) =>
          el.elementType === "custom"
            ? `${(el.customElement as { name?: string }).name} (custom)`
            : (el.elementType as string)
        )
        .join(" · ");

      return {
        content: [
          {
            type: "text" as const,
            text: projectId
              ? `Rendered a ${screenElements.length}-element screen with the project's brand: ${summary}`
              : `Rendered a ${screenElements.length}-element PLAYGROUND screen (demo brand): ${summary}`,
          },
        ],
        structuredContent,
        _meta: meta,
      };
    })
  );
}
