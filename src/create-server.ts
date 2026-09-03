import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createApiClient } from "./api-client.js";
import { registerPlayground } from "./playground/playground.js";
import { registerGenerateScreen } from "./playground/generate-screen.js";
import { registerPreviewAppResource } from "./preview/app-resource.js";
import { registerKnowledgeResources, registerKnowledgeTools } from "./tools/knowledge.js";
import { registerPrompts } from "./prompts.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerScreenTools } from "./tools/screens.js";
import { registerElementTools } from "./tools/elements.js";
import { registerKeyTools } from "./tools/keys.js";
import { registerAgentTools } from "./tools/agent.js";

const INSTRUCTIONS = `BranderUX turns an AI agent's answers into branded, interactive UI.

Two families of tools:
• KNOWLEDGE (no scopes needed) — get_started, read_doc, search_docs, get_integration_snippet.
  Start with get_started. Read the relevant doc BEFORE writing element code or screens;
  both have exact wire formats that fail silently when guessed.
• CONTROL — projects, brand settings, custom elements, screens and API keys for the
  signed-in user. Destructive tools require confirm: true; ask the user first.
• generate_screen — renders a branded, interactive screen in the panel. Pass
  projectId to use a real project's brand + custom elements; omit it for the
  playground (demo brand) when nothing exists yet. SHOW, don't describe.

Two audiences, don't confuse them: these tools let YOU build BranderUX projects; the
customer's own agent renders branded screens via @brander/sdk (see the agent-frameworks
doc) or @brander/mcp-tools if their product is itself an MCP server.

Building for a business with NO AI of its own = a BranderUX-HOSTED agent: read
hosted-agent-contract FIRST and follow THE HOSTED BUILD ARC — mandatory owner questions
(login, access follow-up, handoff email, escalation timing, write consent; never ask which AI
model to use — Sonnet is the default and changes only when the owner asks), write wiring,
set_home_screen, then publish_site immediately as the last build step (don't wait to be
asked). Publishing yields the site AND an identity-free MCP endpoint at <slug>.branderux.app/mcp
(reads plus the owner's enabled add-only writes; not public when sign-in is required).
An owner's own AI-provider key is never handled in chat: never ask for, read or echo one — it goes
in ONLY through the Agent tab's "Your API key" card (or the in-app Builder's request_credential
tool named model-<provider>).`;

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
  registerAgentTools(server, api);
  await registerPlayground(server);
  registerGenerateScreen(server, api);

  return server;
}
