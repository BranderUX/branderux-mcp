import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import { CONFIRM_HINT, DESTRUCTIVE, IDEMPOTENT_WRITE, READ_ONLY, fail, guarded, ok } from "./helpers.js";

/**
 * Custom screens are NOT a REST resource — they are a field of the project
 * aggregate, written via PATCH /projects/{id}. These tools do the
 * read-modify-write inside one call so the agent never has to.
 * NOTE: two agents writing screens on the same project concurrently can race;
 * keep one agent per project.
 */

interface WireScreen {
  id: string;
  name: string;
  description?: string;
  config?: Record<string, unknown>;
  elements?: unknown[];
  version?: number;
  created?: string;
  modified?: string;
  [key: string]: unknown;
}

const screenShape = z
  .object({
    id: z.string().min(1).describe("Stable screen id, e.g. 'custom-home'"),
    name: z.string().min(1),
    description: z.string().optional(),
    config: z
      .object({})
      .passthrough()
      .describe(
        "Screen config: { selectionConfig: { whenToUse, exampleQueries[], clickedElements[] }, layout } — see the screens-wire-format doc (read_doc) for the exact shape. Flat whenToUse/exampleQueries/clickedElements are accepted and lifted into selectionConfig."
      ),
    elements: z
      .array(z.object({}).passthrough())
      .describe(
        "Placements. Custom elements: { id, elementType: null, customElementId: '<element-key>', version: <published version>, position: {row, column, subRow} (ALL 0-BASED), size }. Fixed elements use their enum string as elementType."
      ),
  })
  .passthrough();

async function readScreens(api: ApiClient, projectId: string): Promise<{ project: Record<string, unknown>; screens: WireScreen[] } | null> {
  const project = await api.get<Record<string, unknown>>(`/projects/${projectId}`);
  if (!project) return null;
  const screens = (project.customScreens as WireScreen[] | undefined) ?? [];
  return { project, screens };
}

export function registerScreenTools(server: McpServer, api: ApiClient): void {
  server.registerTool(
    "list_screens",
    {
      title: "List screens",
      description: "List a project's custom screens (id, name, description, placement count).",
      inputSchema: { projectId: z.string().uuid() },
      outputSchema: { screens: z.array(z.object({}).passthrough()) },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId }) => {
      const state = await readScreens(api, projectId);
      if (!state) return fail(`Project ${projectId} not found.`);
      return ok({
        screens: state.screens.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          elementCount: Array.isArray(s.elements) ? s.elements.length : 0,
        })),
      });
    })
  );

  server.registerTool(
    "get_screen",
    {
      title: "Get screen",
      description: "Get one custom screen in full wire format.",
      inputSchema: { projectId: z.string().uuid(), screenId: z.string() },
      outputSchema: { screen: z.object({}).passthrough() },
      annotations: READ_ONLY,
    },
    guarded(async ({ projectId, screenId }) => {
      const state = await readScreens(api, projectId);
      if (!state) return fail(`Project ${projectId} not found.`);
      const screen = state.screens.find((s) => s.id === screenId);
      if (!screen) return fail(`Screen '${screenId}' not found. Existing: ${state.screens.map((s) => s.id).join(", ") || "(none)"}`);
      return ok({ screen });
    })
  );

  server.registerTool(
    "put_screen",
    {
      title: "Create or replace a screen",
      description:
        "Create or replace ONE custom screen (matched by id). Reads current screens, replaces/appends this one, writes back. Read the screens-wire-format doc first — positions are 0-based and custom placements pin an element version.",
      inputSchema: { projectId: z.string().uuid(), screen: screenShape },
      outputSchema: { saved: z.string(), totalScreens: z.number(), version: z.number() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, screen }) => {
      const state = await readScreens(api, projectId);
      if (!state) return fail(`Project ${projectId} not found.`);

      const now = new Date().toISOString();
      const existing = state.screens.find((s) => s.id === screen.id);
      // Canonical config shape: the AI-selection fields live NESTED under
      // selectionConfig (the Screen Builder reads config.selectionConfig.whenToUse).
      // Accept the flat form agents were taught earlier and lift it.
      const rawConfig = (screen.config ?? {}) as Record<string, unknown>;
      const nested = (rawConfig.selectionConfig ?? {}) as Record<string, unknown>;
      const pick = (key: string): unknown => nested[key] ?? rawConfig[key];
      const selectionConfig = {
        whenToUse: typeof pick("whenToUse") === "string" ? pick("whenToUse") : "",
        exampleQueries: Array.isArray(pick("exampleQueries")) ? pick("exampleQueries") : [],
        clickedElements: Array.isArray(pick("clickedElements")) ? pick("clickedElements") : [],
      };
      const { whenToUse: _w, exampleQueries: _q, clickedElements: _c, ...configRest } = rawConfig;
      const wire: WireScreen = {
        ...screen,
        // Server-owned fields win over anything echoed back from get_screen —
        // the version always bumps, created is always preserved.
        created: existing?.created ?? now,
        version: (existing?.version ?? 0) + 1,
        modified: now,
        // The renderer reads config.elements; keep it in lockstep with elements.
        config: {
          ...configRest,
          id: screen.id,
          name: screen.name,
          description: screen.description ?? "",
          selectionConfig,
          elements: screen.elements,
        },
      };
      const next = existing
        ? state.screens.map((s) => (s.id === screen.id ? wire : s))
        : [...state.screens, wire];

      await api.patch(`/projects/${projectId}`, { customScreens: next });
      return ok({ saved: screen.id, totalScreens: next.length, version: wire.version });
    })
  );

  server.registerTool(
    "delete_screen",
    {
      title: "Delete screen",
      description: `Delete one custom screen from a project. ${CONFIRM_HINT}`,
      inputSchema: { projectId: z.string().uuid(), screenId: z.string(), confirm: z.boolean().default(false) },
      outputSchema: { deleted: z.string(), totalScreens: z.number() },
      annotations: DESTRUCTIVE,
    },
    guarded(async ({ projectId, screenId, confirm }) => {
      if (!confirm) return fail(CONFIRM_HINT);
      const state = await readScreens(api, projectId);
      if (!state) return fail(`Project ${projectId} not found.`);
      if (!state.screens.some((s) => s.id === screenId)) {
        return fail(`Screen '${screenId}' not found.`);
      }
      const next = state.screens.filter((s) => s.id !== screenId);
      await api.patch(`/projects/${projectId}`, { customScreens: next });
      return ok({ deleted: screenId, totalScreens: next.length });
    })
  );
}
