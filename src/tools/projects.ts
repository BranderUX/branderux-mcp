import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import { CONFIRM_HINT, DESTRUCTIVE, IDEMPOTENT_WRITE, READ_ONLY, WRITE, fail, guarded, ok } from "./helpers.js";

const brandSettingsShape = z
  .object({})
  .passthrough()
  .describe(
    "Partial BrandSettings — only the fields to change. Common: brandName, primaryColor, secondaryColor, accentColor, backgroundColor, textColor, fontStyle, borderRadius, logoUrl, darkMode."
  );

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
        ...(brandSettings ? { brandSettings } : {}),
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
      const merged = { ...(project.brandSettings ?? {}), ...brandSettings };
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
        "Merge changes into project.settings — uiGenerationMode ('flexible' | 'deterministic'), elementVisibility, customPages, flexibleModeRules, elementStyleVariant.",
      inputSchema: { projectId: z.string().uuid(), settings: z.object({}).passthrough() },
      outputSchema: { project: z.object({}).passthrough() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, settings }) => {
      const project = await api.get<{ settings?: Record<string, unknown> }>(`/projects/${projectId}`);
      if (!project) return fail(`Project ${projectId} not found.`);
      const merged = { ...(project.settings ?? {}), ...settings };
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
