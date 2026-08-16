import { z } from "zod";
import { buildActionsContract } from "../lib/element-actions.js";
import { transform } from "sucrase";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import { CONFIRM_HINT, DESTRUCTIVE, READ_ONLY, WRITE, fail, guarded, ok } from "./helpers.js";
import { buildPreviewPayload, extractImageOrigins } from "../preview/compile.js";
import { normalizeBrandForPanel } from "../playground/generate-screen.js";
import { PREVIEW_RESOURCE_URI, isPreviewAppAvailable, previewMeta } from "../preview/app-resource.js";

/**
 * Custom-element tools. The AGENT writes the element code itself (it knows the
 * customer's product); these tools validate against the authoring contract and
 * publish. No BranderUX AI is involved — versions are submitted with
 * extractionStatus "succeeded", exactly like a hand-authored seed.
 */

const ALLOWED_IMPORTS = new Set([
  "react",
  "@mui/material",
  "@mui/system",
  "@emotion/react",
  "@emotion/styled",
  "lucide-react",
  "recharts",
  "framer-motion",
  "date-fns",
]);

/** The code's declared on*ContextMenu prop (optional Props field), if any. */
export function detectRightClickProp(code: string): string | null {
  const match = code.match(/\b(on[A-Z][A-Za-z0-9]*ContextMenu)\s*\?\s*:/);
  return match ? (match[1] as string) : null;
}

/** Compile with sucrase + enforce the sandbox import allowlist and export contract. */
export function validateElementCode(code: string, kind: "component" | "skeleton"): string[] {
  const problems: string[] = [];
  try {
    transform(code, { transforms: ["typescript", "jsx"] });
  } catch (error) {
    problems.push(`Does not compile: ${error instanceof Error ? error.message : String(error)}`);
    return problems;
  }
  for (const match of code.matchAll(/from\s+["']([^"']+)["']/g)) {
    const source = match[1];
    const root = source.startsWith("@") ? source.split("/").slice(0, 2).join("/") : source.split("/")[0];
    if (!ALLOWED_IMPORTS.has(root) && !ALLOWED_IMPORTS.has(source)) {
      problems.push(`Import '${source}' is not in the sandbox allowlist (${[...ALLOWED_IMPORTS].join(", ")}).`);
    }
  }
  if (kind === "component") {
    if (!/export\s+default\s+function\s+Component\s*\(/.test(code)) {
      problems.push("The component must be `export default function Component(...)` — exactly that name.");
    }
    if (!/export\s+interface\s+Props\b/.test(code)) {
      problems.push("The file must `export interface Props` describing every prop (no defaults on props).");
    }
  } else if (!/export\s+default\s+function\s+SkeletonComponent\s*\(/.test(code)) {
    problems.push("The skeleton must be `export default function SkeletonComponent()`.");
  }
  return problems;
}

interface WireVersionPayload {
  version?: number;
  code?: string;
  defaultProps?: Record<string, unknown>;
  clickQueryTemplate?: string | null;
  interactionPropName?: string | null;
}

/**
 * Attach the element-preview MCP App to a tool result: the preview payload rides
 * in structuredContent (matching the app's ontoolresult reader) and `_meta.ui`
 * points hosts at the app resource. Hosts without apps support see text only.
 */
function withPreview(
  result: ReturnType<typeof ok>,
  source: { name: string; version?: number; brandSettings?: Record<string, unknown> } & WireVersionPayload
): ReturnType<typeof ok> {
  if (!isPreviewAppAvailable() || !source.code) return result;
  const preview = buildPreviewPayload({
    name: source.name,
    version: source.version,
    code: source.code,
    defaultProps: source.defaultProps,
    clickQueryTemplate: source.clickQueryTemplate,
    interactionPropName: source.interactionPropName,
  });
  if (!preview) return result;
  if (source.brandSettings) preview.brandSettings = source.brandSettings;
  return {
    ...result,
    structuredContent: { ...(result.structuredContent ?? {}), preview },
    _meta: previewMeta(extractImageOrigins(source.defaultProps)),
  };
}

/** Project brand for preview theming — fail-soft to undefined (preview stays neutral). */
async function fetchPanelBrand(
  api: ApiClient,
  projectId: string
): Promise<Record<string, unknown> | undefined> {
  try {
    const project = await api.get<{ brandSettings?: Record<string, unknown> }>(
      `/projects/${projectId}`
    );
    return project?.brandSettings ? normalizeBrandForPanel(project.brandSettings) : undefined;
  } catch {
    return undefined;
  }
}


/** The actions contract for `actionHandlers` wiring — assembled from the version payload. */
function actionsFor(element: Record<string, unknown>): ReturnType<typeof buildActionsContract> {
  const payload = element.currentVersionPayload as
    | {
        code?: string;
        propsSchema?: Record<string, unknown> | null;
        defaultProps?: Record<string, unknown> | null;
        clickQueryTemplate?: string | null;
      }
    | null
    | undefined;
  if (!payload?.code) return [];
  return buildActionsContract({
    code: payload.code,
    propsSchema: payload.propsSchema ?? null,
    defaultProps: payload.defaultProps ?? null,
    clickQueryTemplate: payload.clickQueryTemplate ?? null,
  });
}

export function registerElementTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "list_elements",
    {
      title: "List custom elements",
      description: "List a project's custom elements (key, name, status, current version) incl. the actions contract: actions[].name are the EXACT actionHandlers keys, with meaning, itemShape and exampleItem per action.",
      inputSchema: { projectId: z.string().uuid() },
      outputSchema: { elements: z.array(z.object({}).passthrough()) },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId }) => {
      const elements = await api.get<Record<string, unknown>[]>(
        `/projects/${projectId}/elements?includeDrafts=true`
      );
      return ok({
        elements: (elements ?? []).map((e) => ({
          id: e.id,
          elementKey: e.elementKey,
          name: e.name,
          status: e.status,
          currentVersion: e.currentVersion,
          description: e.description,
          // For actionHandlers wiring: actions[].name are the EXACT prop keys.
          // Drafts excluded — their actions cannot fire until published.
          actions: e.status === "published" ? actionsFor(e) : [],
        })),
      });
    })
  );

  server.registerTool(
    "get_element",
    {
      title: "Get custom element",
      description: "Get one custom element including its current version's code and metadata.",
      inputSchema: { projectId: z.string().uuid(), elementId: z.string().uuid() },
      outputSchema: { element: z.object({}).passthrough() },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId, elementId }) => {
      const element = await api.get<Record<string, unknown>>(`/projects/${projectId}/elements/${elementId}`);
      if (!element) return fail(`Element ${elementId} not found.`);
      return ok({ element: { ...element, actions: actionsFor(element) } });
    })
  );

  server.registerTool(
    "preview_element",
    {
      title: "Preview custom element",
      description:
        "Render a published custom element live (with its demo props) in the client's app panel — clicks show the exact query they would send. In clients without MCP Apps support this returns the element data as text.",
      inputSchema: { projectId: z.string().uuid(), elementId: z.string().uuid() },
      outputSchema: {
        element: z.object({}).passthrough(),
        preview: z.object({}).passthrough().optional(),
      },
      annotations: READ_ONLY,
      _meta: {
        ui: { resourceUri: PREVIEW_RESOURCE_URI },
        "ui/resourceUri": PREVIEW_RESOURCE_URI,
      },
    },
    guarded(async ({ projectId, elementId }) => {
      const element = await api.get<{
        id?: string;
        elementKey?: string;
        name?: string;
        status?: string;
        currentVersionPayload?: WireVersionPayload;
      }>(`/projects/${projectId}/elements/${elementId}`);
      if (!element) return fail(`Element ${elementId} not found.`);
      const payload = element.currentVersionPayload;
      if (!payload?.code) {
        return fail(`Element ${elementId} has no version code to preview.`);
      }
      const summary = {
        id: element.id,
        elementKey: element.elementKey,
        name: element.name,
        status: element.status,
        version: payload.version,
      };
      const result = ok(
        `Previewing "${element.name}" v${payload.version ?? "?"} — the panel renders it live; interactions show the query they would send.`,
        { element: summary }
      );
      return withPreview(result, {
        name: element.name ?? element.elementKey ?? "Custom element",
        ...payload,
        brandSettings: await fetchPanelBrand(api, projectId),
      });
    })
  );

  server.registerTool(
    "create_element",
    {
      title: "Create custom element",
      description:
        "Create AND publish a custom element from agent-written TSX. Pre-flight validates the code (compile + sandbox import allowlist + export contract) before anything is sent. Read the custom-elements-contract doc first. In clients with MCP Apps support the published element renders live in the panel.",
      annotations: WRITE,
      outputSchema: {
        element: z.object({}).passthrough(),
        preview: z.object({}).passthrough().optional(),
      },
      _meta: {
        ui: { resourceUri: PREVIEW_RESOURCE_URI },
        "ui/resourceUri": PREVIEW_RESOURCE_URI,
      },
      inputSchema: {
      projectId: z.string().uuid(),
      name: z.string().min(1).max(80).describe("Display name; the element key is derived server-side"),
      description: z.string().min(1).max(500),
      category: z.enum(["data", "media", "interactive", "custom"]),
      iconName: z.string().min(1).describe("lucide-react icon name, e.g. 'ShoppingBag'"),
      code: z.string().min(1).describe("Inner component TSX: export interface Props + export default function Component"),
      skeletonCode: z.string().optional().describe("Loading skeleton: export default function SkeletonComponent, Box/Skeleton/Stack only"),
      propsSchema: z.object({}).passthrough().describe("JSON Schema of Props"),
      defaultProps: z.object({}).passthrough().describe("Realistic demo props matching propsSchema"),
      structurePrompt: z.string().min(1).describe("When-to-use + data guidance for the runtime AI (no layout directives)"),
      clickQueryTemplate: z
        .string()
        .nullable()
        .describe("Primary click query template with {field} tokens, or a JSON map {\"$primary\": ..., \"onX\": ...}; null for non-interactive"),
      interactionPropName: z.string().nullable().describe("Primary callback prop, e.g. 'onSelectItem'; null if none"),
      },
    },
    guarded(async (input) => {
      const problems = validateElementCode(input.code, "component");
      if (input.skeletonCode) problems.push(...validateElementCode(input.skeletonCode, "skeleton"));
      if (problems.length) return fail(`Element rejected by pre-flight validation:\n- ${problems.join("\n- ")}`);

      const version = {
        code: input.code,
        skeletonCode: input.skeletonCode ?? null,
        prompt: "Authored by the customer's agent via the BranderUX MCP.",
        propsSchema: input.propsSchema,
        defaultProps: input.defaultProps,
        toolSchema: { description: input.description, input_schema: input.propsSchema },
        structurePrompt: input.structurePrompt,
        clickQueryTemplate: input.clickQueryTemplate,
        interactionPropName: input.interactionPropName,
        rightClickPropName: detectRightClickProp(input.code),
        clickArgIsObject: true,
        extractionStatus: "succeeded",
      };
      const created = await api.post<Record<string, unknown>>(`/projects/${input.projectId}/elements`, {
        name: input.name,
        description: input.description,
        category: input.category,
        iconName: input.iconName,
        status: "published",
        version,
      });
      return withPreview(ok({ element: created ?? {} }), {
        name: input.name,
        version: 1,
        code: input.code,
        defaultProps: input.defaultProps,
        clickQueryTemplate: input.clickQueryTemplate,
        interactionPropName: input.interactionPropName,
        brandSettings: await fetchPanelBrand(api, input.projectId),
      });
    })
  );

  server.registerTool(
    "publish_element_version",
    {
      title: "Publish element version",
      description:
        "Append a new version to an existing element (same pre-flight validation) and promote it to published.",
      annotations: WRITE,
      outputSchema: {
        elementId: z.string(),
        publishedVersion: z.number().optional(),
        preview: z.object({}).passthrough().optional(),
      },
      _meta: {
        ui: { resourceUri: PREVIEW_RESOURCE_URI },
        "ui/resourceUri": PREVIEW_RESOURCE_URI,
      },
      inputSchema: {
      projectId: z.string().uuid(),
      elementId: z.string().uuid(),
      code: z.string().min(1),
      skeletonCode: z.string().optional(),
      propsSchema: z.object({}).passthrough(),
      defaultProps: z.object({}).passthrough(),
      structurePrompt: z.string().min(1),
      clickQueryTemplate: z.string().nullable(),
      interactionPropName: z.string().nullable(),
      },
    },
    guarded(async (input) => {
      const problems = validateElementCode(input.code, "component");
      if (input.skeletonCode) problems.push(...validateElementCode(input.skeletonCode, "skeleton"));
      if (problems.length) return fail(`Version rejected by pre-flight validation:\n- ${problems.join("\n- ")}`);

      const element = await api.get<{ description?: string; name?: string }>(
        `/projects/${input.projectId}/elements/${input.elementId}`
      );
      if (!element) return fail(`Element ${input.elementId} not found.`);

      const appended = await api.post<{ version: number }>(
        `/projects/${input.projectId}/elements/${input.elementId}/versions`,
        {
          code: input.code,
          skeletonCode: input.skeletonCode ?? null,
          prompt: "Authored by the customer's agent via the BranderUX MCP.",
          propsSchema: input.propsSchema,
          defaultProps: input.defaultProps,
          toolSchema: { description: element.description ?? "", input_schema: input.propsSchema },
          structurePrompt: input.structurePrompt,
          clickQueryTemplate: input.clickQueryTemplate,
          interactionPropName: input.interactionPropName,
          rightClickPropName: detectRightClickProp(input.code),
          clickArgIsObject: true,
          extractionStatus: "succeeded",
        }
      );
      await api.patch(`/projects/${input.projectId}/elements/${input.elementId}`, { status: "published" });
      const result = ok({ elementId: input.elementId, publishedVersion: appended?.version });
      return withPreview(result, {
        name: element.name ?? "Custom element",
        version: appended?.version,
        code: input.code,
        defaultProps: input.defaultProps,
        clickQueryTemplate: input.clickQueryTemplate,
        interactionPropName: input.interactionPropName,
        brandSettings: await fetchPanelBrand(api, input.projectId),
      });
    })
  );

  server.registerTool(
    "delete_element",
    {
      title: "Delete custom element",
      description: `Delete a custom element (existing screen placements will stop rendering it). ${CONFIRM_HINT}`,
      inputSchema: { projectId: z.string().uuid(), elementId: z.string().uuid(), confirm: z.boolean().default(false) },
      outputSchema: { deleted: z.string() },
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ projectId, elementId, confirm }) => {
      if (!confirm) return fail(CONFIRM_HINT);
      await api.delete(`/projects/${projectId}/elements/${elementId}`);
      return ok({ deleted: elementId });
    })
  );
}
