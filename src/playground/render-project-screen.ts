/**
 * render_project_screen — the project-aware sibling of the playground's
 * generate_screen: renders a screen in the SAME universal-renderer panel, but
 * with a REAL project's brand settings and published custom elements (fetched
 * with the caller's token, compiled server-side). Unknown custom keys fail
 * LOUD with the list of available keys — never a silent drop.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import { READ_ONLY, fail, guarded } from "../tools/helpers.js";
import { compileForPreview, extractCallbackNames, extractImageOrigins } from "../preview/compile.js";

/** The mcp-tools universal renderer — registered by the playground's registerBranderTools. */
const RENDERER_RESOURCE_URI = "ui://brander/element-renderer";

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

export function registerRenderProjectScreen(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "render_project_screen",
    {
      title: "Render a project screen",
      description:
        "Render a screen in the panel using a REAL project's brand settings and published " +
        "CUSTOM elements (unlike generate_screen, which is a project-less demo playground). " +
        `Elements: the 15 fixed types (${FIXED_TYPES.join(", ")}) plus ` +
        '{ elementType: "custom", key: "<element-key>", props } for the project\'s own elements — ' +
        "call list_elements first for keys and read each element's propsSchema via get_element. " +
        "Set clickQuery on elements so clicks send follow-up queries.",
      inputSchema: {
        projectId: z.string().uuid(),
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
      const project = await api.get<{
        brandSettings?: Record<string, unknown>;
        settings?: Record<string, unknown>;
      }>(`/projects/${projectId}`);
      if (!project) return fail(`Project ${projectId} not found.`);

      const needsCustom = elements.some((e) => e.elementType === "custom");
      const byKey = new Map<string, WireElement>();
      if (needsCustom) {
        const wire = await api.get<WireElement[]>(`/projects/${projectId}/elements`);
        for (const el of wire ?? []) {
          if (el.elementKey) byKey.set(el.elementKey, el);
        }
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
            `Custom element key "${entry.key ?? "(missing)"}" not found in project ${projectId}. ` +
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
        brandSettings: project.brandSettings ?? {},
        projectSettings: project.settings ?? {},
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
            text: `Rendered a ${screenElements.length}-element screen with the project's brand: ${summary}`,
          },
        ],
        structuredContent,
        _meta: meta,
      };
    })
  );
}
