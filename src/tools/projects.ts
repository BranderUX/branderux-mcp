import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import { CONFIRM_HINT, DESTRUCTIVE, IDEMPOTENT_WRITE, READ_ONLY, WRITE, fail, guarded, ok } from "./helpers.js";

const brandSettingsShape = z
  .object({})
  .passthrough()
  .describe(
    "Partial BrandSettings — only the fields to change. Colors: brandName, primaryColor, secondaryColor, accentColor, backgroundColor, darkMode (boolean), borderRadius (number). " +
      'fontStyle MUST be a computed object: {"fontFamily": "\'Inter\', sans-serif", "weight": 500, "displayName": "Inter"} — never a bare string or null. ' +
      'layoutStyle likewise: {"spacing": 16, "elevation": 2, "displayName": "Clean"}. Strings are auto-coerced server-side, but send the object form.'
  );

/**
 * Agents love writing fontStyle/layoutStyle as bare strings or null — shapes that
 * used to crash the dashboard at render. Coerce to the computed object forms the
 * client expects; nulls are dropped so stored settings never carry them.
 */
function normalizeBrandInput(brandSettings: Record<string, unknown>): Record<string, unknown> {
  const out = { ...brandSettings };
  const font = out.fontStyle;
  if (font === null || font === undefined) {
    delete out.fontStyle;
  } else if (typeof font === "string") {
    const name = font.trim() || "Inter";
    out.fontStyle = {
      fontFamily: name.includes(",") ? name : `'${name}', sans-serif`,
      weight: 500,
      displayName: name,
      isCustom: true,
    };
  }
  const layout = out.layoutStyle;
  if (layout === null || layout === undefined) {
    delete out.layoutStyle;
  } else if (typeof layout === "string") {
    out.layoutStyle = { spacing: 16, elevation: 2, displayName: layout.trim() || "Clean", isCustom: true };
  }
  for (const key of Object.keys(out)) {
    if (out[key] === null) delete out[key];
  }
  return out;
}

const projectSummary = {
  id: z.string(),
  name: z.string(),
};

export function registerProjectTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "Who is authenticated, and their projects. Call this first to orient yourself.",
      inputSchema: {},
      outputSchema: {
        user: z.object({}).passthrough(),
        projects: z.array(z.object(projectSummary).passthrough()),
      },
      annotations: READ_ONLY,
    },
    guarded(async () => {
      const me = await api.get<Record<string, unknown>>("/auth/me");
      const projects = await api.get<{ id: string; name: string }[]>("/projects");
      const payload = {
        user: me ?? {},
        projects: (projects ?? []).map((p) => ({ id: p.id, name: p.name })),
      };
      return ok(payload);
    })
  );

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description: "List the user's BranderUX projects.",
      inputSchema: {},
      outputSchema: { projects: z.array(z.object(projectSummary).passthrough()) },
      annotations: READ_ONLY,
    },
    guarded(async () => {
      const projects = await api.get<Record<string, unknown>[]>("/projects");
      return ok({ projects: projects ?? [] });
    })
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description:
        "Get one project in full: brand settings, settings (uiGenerationMode, customPages, elementVisibility) and custom screens.",
      inputSchema: { projectId: z.string().uuid() },
      outputSchema: { project: z.object({}).passthrough() },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId }) => {
      const project = await api.get<Record<string, unknown>>(`/projects/${projectId}`);
      if (!project) return fail(`Project ${projectId} not found (the API returns 204 for absent resources).`);
      return ok({ project });
    })
  );

  server.registerTool(
    "create_project",
    {
      title: "Create project",
      description: "Create a new BranderUX project. Returns the created project including its id.",
      inputSchema: {
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
        brandSettings: brandSettingsShape.optional(),
      },
      outputSchema: { project: z.object({}).passthrough() },
      annotations: WRITE,
    },
    guarded(async ({ name, description, brandSettings }) => {
      const created = await api.post<Record<string, unknown>>("/projects", {
        name,
        ...(description ? { description } : {}),
        ...(brandSettings ? { brandSettings: normalizeBrandInput(brandSettings) } : {}),
      });
      return ok({ project: created ?? {} });
    })
  );

  server.registerTool(
    "update_brand_settings",
    {
      title: "Update brand settings",
      description:
        "Merge changes into a project's brand settings (colors, fonts, logo, radius). Reads current settings first so unspecified fields are preserved.",
      inputSchema: { projectId: z.string().uuid(), brandSettings: brandSettingsShape },
      outputSchema: { project: z.object({}).passthrough() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, brandSettings }) => {
      const project = await api.get<{ brandSettings?: Record<string, unknown> }>(`/projects/${projectId}`);
      if (!project) return fail(`Project ${projectId} not found.`);
      const merged = { ...(project.brandSettings ?? {}), ...normalizeBrandInput(brandSettings) };
      const updated = await api.patch<Record<string, unknown>>(`/projects/${projectId}`, {
        brandSettings: merged,
      });
      return ok({ project: updated ?? {} });
    })
  );

  server.registerTool(
    "update_project_settings",
    {
      title: "Update project settings",
      description:
        "Merge changes into project.settings — uiGenerationMode ('flexible' | 'deterministic'), elementVisibility, customPages, flexibleModeRules, elementStyleVariant. " +
        "Every finished build MUST set customPages (2-5 nav entries matching the screens) — without them the playground opens to a setup dialog instead of the product. " +
        "elementVisibility merges key-wise: fixed-element keys are the kebab type names (header, stats-grid, data-table, line-chart, pie-chart, bar-chart, item-grid, item-card, image, details-data, chat-bubble, form, button, alert, video), custom elements are custom:<key>; false disables, absent = enabled.",
      inputSchema: { projectId: z.string().uuid(), settings: z.object({}).passthrough() },
      outputSchema: { project: z.object({}).passthrough() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, settings }) => {
      const project = await api.get<{ settings?: Record<string, unknown> }>(`/projects/${projectId}`);
      if (!project) return fail(`Project ${projectId} not found.`);
      const current = project.settings ?? {};
      const merged = { ...current, ...settings };
      // elementVisibility merges KEY-WISE — a partial write must never wipe the
      // other toggles (especially custom:<key> entries the dashboard manages).
      if (settings.elementVisibility && typeof settings.elementVisibility === "object") {
        merged.elementVisibility = {
          ...((current.elementVisibility as Record<string, boolean> | undefined) ?? {}),
          ...(settings.elementVisibility as Record<string, boolean>),
        };
      }
      const updated = await api.patch<Record<string, unknown>>(`/projects/${projectId}`, {
        settings: merged,
      });
      return ok({ project: updated ?? {} });
    })
  );

  server.registerTool(
    "delete_project",
    {
      title: "Delete project",
      description: `Permanently delete a project and everything in it. ${CONFIRM_HINT}`,
      inputSchema: { projectId: z.string().uuid(), confirm: z.boolean().default(false) },
      outputSchema: { deleted: z.string() },
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ projectId, confirm }) => {
      if (!confirm) return fail(CONFIRM_HINT);
      await api.delete(`/projects/${projectId}`);
      return ok({ deleted: projectId });
    })
  );
}
