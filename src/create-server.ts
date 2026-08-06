import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createApiClient } from "./api-client.js";
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

Two audiences, don't confuse them: these tools let YOU build BranderUX projects; the
customer's own agent renders branded screens via @brander/sdk (see the agent-frameworks
doc) or @brander/mcp-tools if their product is itself an MCP server.`;

/**
 * One stateless MCP server per request, bound to the caller's agent bearer.
 * Knowledge tools never call the API; control tools ride a token obtained by
 * exchanging the caller's token for an API-audience one (see auth.ts).
 */
export function createServer(apiTokenProvider: () => Promise<string>): McpServer {
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

  return server;
}
