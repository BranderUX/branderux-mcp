/**
 * Playground — the builder MCP demos its own product. `registerBranderTools`
 * (the same published @brander/mcp-tools customers install) is registered with a
 * canned brand + screen patterns instead of a customer's apiKey/projectId, so a
 * freshly-connected design partner can say "show me what BranderUX looks like"
 * and get a real branded, interactive screen in the panel — model-invented demo
 * data, actual renderer.
 *
 * The config rides through `brandSettingsPath`: it is written to the OS temp dir
 * at cold start (no extra file to trace into the serverless bundle).
 */

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerBranderTools } from "@brander/mcp-tools";

export const PLAYGROUND_CONFIG = {
  projectName: "BranderUX Playground",
  // The NEUTRAL new-project default brand (mirrors the app's defaultSettings) —
  // deliberately not a real-looking brand: a canned palette that can pass for a
  // customer's (the old Nova espresso/cream did, for a coffee shop) misleads.
  brandSettings: {
    brandName: "Your Brand",
    primaryColor: "#6366F1",
    secondaryColor: "#06B6D4",
    accentColor: "#F59E0B",
    fontStyle: { fontFamily: "'Inter', sans-serif", weight: 500, displayName: "modern" },
    layoutStyle: { spacing: 3, elevation: 1, displayName: "clean" },
    borderRadius: 12,
    darkMode: true,
  },
  settings: {},
  screenVisibility: {},
  // Patterns only — they teach the model screen shapes for the tool description.
  customScreens: [
    {
      id: "playground-storefront",
      name: "Storefront",
      config: {
        elements: [{ elementType: "header" }, { elementType: "item-grid" }],
      },
      created: "2026-08-08T00:00:00Z",
      modified: "2026-08-08T00:00:00Z",
    },
    {
      id: "playground-analytics",
      name: "Analytics",
      config: {
        elements: [
          { elementType: "header" },
          { elementType: "stats-grid" },
          { elementType: "line-chart" },
          { elementType: "data-table" },
        ],
      },
      created: "2026-08-08T00:00:00Z",
      modified: "2026-08-08T00:00:00Z",
    },
    {
      id: "playground-order",
      name: "Order flow",
      config: {
        elements: [
          { elementType: "item-card" },
          { elementType: "details-data" },
          { elementType: "form" },
          { elementType: "button" },
        ],
      },
      created: "2026-08-08T00:00:00Z",
      modified: "2026-08-08T00:00:00Z",
    },
  ],
};

let configPath: string | null = null;

function playgroundConfigPath(): string {
  if (!configPath) {
    configPath = join(tmpdir(), "branderux-playground-config.json");
    writeFileSync(configPath, JSON.stringify(PLAYGROUND_CONFIG));
  }
  return configPath;
}

/**
 * Fail-soft: a playground problem must never take down the control tools.
 * No apiKey — the custom-element loader inside registerBranderTools returns []
 * and the config comes from the local file, so nothing touches the API.
 */
export async function registerPlayground(server: McpServer): Promise<void> {
  try {
    await registerBranderTools(server, {
      projectId: "playground",
      brandSettingsPath: playgroundConfigPath(),
    });
    // The library's tool is single-project by design (right for CUSTOMER servers,
    // wrong for the builder). Remove it — the unified generate_screen in
    // generate-screen.ts replaces it, keeping the library's renderer RESOURCE
    // and its image-proxy tool.
    const registered = (
      server as unknown as {
        _registeredTools?: Record<string, { remove?: () => void }>;
      }
    )._registeredTools?.["generate_screen"];
    registered?.remove?.();
  } catch (error) {
    console.error("[branderux-mcp] playground unavailable:", error);
  }
}
