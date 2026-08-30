import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiClient } from "../api-client.js";
import { CONFIRM_HINT, DESTRUCTIVE, IDEMPOTENT_WRITE, READ_ONLY, fail, guarded, ok } from "./helpers.js";
import { APP_BASE } from "../config.js";

/**
 * Custom screens live on the project aggregate. Reads (list_screens,
 * get_screen) fetch the aggregate; writes (put_screen, delete_screen) go to
 * atomic per-screen endpoints (PUT/DELETE /projects/{id}/screens/{screenId})
 * where the server merges by id under the project row lock — concurrent
 * writes on the same project are safe.
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
        "Placements. Custom elements: { id, elementType: null, customElementId: '<element-key>', version: <published version>, position: {row, column, subRow} (ALL 0-BASED), size }. Fixed elements use the KEBAB-CASE type value as elementType (header, stats-grid, data-table, line-chart, pie-chart, bar-chart, item-grid, item-card, image, details-data, chat-bubble, form, button, alert, video) — NEVER the uppercase enum name (ITEM_GRID becomes null server-side)."
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
        "Create or replace ONE custom screen (matched by id) — an atomic per-screen PUT; the server merges under the project row lock and owns created/version/modified. Read the screens-wire-format doc first — positions are 0-based and custom placements pin an element version.",
      inputSchema: { projectId: z.string().uuid(), screen: screenShape },
      outputSchema: { saved: z.string(), totalScreens: z.number(), version: z.number() },
      annotations: IDEMPOTENT_WRITE,
    },
    guarded(async ({ projectId, screen }) => {
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
      // Server enums deserialize by kebab VALUE; uppercase names (ITEM_GRID) become
      // null silently. Coerce so a doc-following agent can't lose placements.
      const toKebab = (value: unknown): unknown =>
        typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(value)
          ? value.toLowerCase().replace(/_/g, "-")
          : value;
      const normalizedElements = (screen.elements as Record<string, unknown>[]).map((el) => ({
        ...el,
        elementType: toKebab(el.elementType),
      }));
      // The server owns created/version/modified — strip echoed copies so a
      // get_screen → put_screen roundtrip can't resend them stale.
      const { version: _v, created: _cr, modified: _m, ...clientScreen } = screen;
      const wire: WireScreen = {
        ...clientScreen,
        elements: normalizedElements,
        // The renderer reads config.elements; keep it in lockstep with elements.
        config: {
          ...configRest,
          id: screen.id,
          name: screen.name,
          description: screen.description ?? "",
          selectionConfig,
          elements: normalizedElements,
        },
      };
      // ATOMIC per-screen upsert: the server merges by id under the project
      // row lock and owns created/version/modified — parallel saves of
      // different screens can no longer overwrite each other (the old
      // read→whole-array-PATCH raced exactly that way).
      const saved = await api.put<{ saved: string; version: number; totalScreens: number }>(
        `/projects/${projectId}/screens/${encodeURIComponent(screen.id)}`,
        wire
      );
      const version = saved?.version ?? 1;
      const total = saved?.totalScreens ?? 1;
      return ok(
        `Saved screen "${screen.id}" (v${version}, ${total} total). ` +
          `Try the project live: ${APP_BASE}/playground?projectId=${projectId} — share this link with the user.`,
        { saved: screen.id, totalScreens: total, version }
      );
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
      // Atomic per-screen delete (same row-locked merge as put_screen).
      const result = await api.delete<{ saved: string; totalScreens: number }>(
        `/projects/${projectId}/screens/${encodeURIComponent(screenId)}`
      );
      return ok({ deleted: screenId, totalScreens: result?.totalScreens ?? 0 });
    })
  );
}
