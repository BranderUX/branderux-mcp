import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createApiClient } from "./api-client.js";
import { registerPlayground } from "./playground/playground.js";
import { registerRenderProjectScreen } from "./playground/render-project-screen.js";
import { registerPreviewAppResource } from "./preview/app-resource.js";
import { registerKnowledgeResources, registerKnowledgeTools } from "./tools/knowledge.js";
import { registerPrompts } from "./prompts.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerScreenTools } from "./tools/screens.js";
import { registerElementTools } from "./tools/elements.js";
import { registerKeyTools } from "./tools/keys.js";

const INSTRUCTIONS = `BranderUX turns an AI agent's answers into branded, interactive UI.

Two families of tools:
• KNOWLEDGE (no scopes needed) — get_started, read_doc, search_docs, get_integration_snippet.
  Start with get_started. Read the relevant doc BEFORE writing element code or screens;
  both have exact wire formats that fail silently when guessed.
• CONTROL — projects, brand settings, custom elements, screens and API keys for the
  signed-in user. Destructive tools require confirm: true; ask the user first.
• PLAYGROUND — generate_screen renders a real branded, interactive screen in the
  panel with demo data (no project needed). Use it to SHOW what BranderUX output
  looks like before building anything.

Two audiences, don't confuse them: these tools let YOU build BranderUX projects; the
customer's own agent renders branded screens via @brander/sdk (see the agent-frameworks
doc) or @brander/mcp-tools if their product is itself an MCP server.`;

/**
 * One stateless MCP server per request, bound to the caller's agent bearer.
 * Knowledge tools never call the API; control tools ride a token obtained by
 * exchanging the caller's token for an API-audience one (see auth.ts).
 */
export async function createServer(apiTokenProvider: () => Promise<string>): Promise<McpServer> {
  const server = new McpServer(
    {
      name: "branderux",
      title: "BranderUX",
      version: "0.1.0",
      websiteUrl: "https://branderux.com/mcp",
    },
    { instructions: INSTRUCTIONS }
  );

  const api = createApiClient(apiTokenProvider);

  registerKnowledgeTools(server);
  registerKnowledgeResources(server);
  registerPreviewAppResource(server);
  registerPrompts(server);
  registerProjectTools(server, api);
  registerScreenTools(server, api);
  registerElementTools(server, api);
  registerKeyTools(server, api);
  await registerPlayground(server);
  registerRenderProjectScreen(server, api);

  return server;
}
