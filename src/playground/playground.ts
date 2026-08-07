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

const PLAYGROUND_CONFIG = {
  projectName: "BranderUX Playground",
  brandSettings: {
    brandName: "Atelier Nova",
    primaryColor: "#2E241D",
    secondaryColor: "#C06B4A",
    accentColor: "#E8B84B",
    backgroundColor: "#F1E8DC",
    textColor: "#2E241D",
    fontStyle: { fontFamily: "Georgia, serif", weight: 500, displayName: "Georgia" },
    layoutStyle: { spacing: 16, elevation: 1, displayName: "Clean" },
    borderRadius: 12,
    darkMode: false,
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
  } catch (error) {
    console.error("[branderux-mcp] playground unavailable:", error);
  }
}
