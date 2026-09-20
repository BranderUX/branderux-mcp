import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createApiClient } from "./api-client.js";
import { createAppClient } from "./app-client.js";
import { registerPlayground } from "./playground/playground.js";
import { registerGenerateScreen } from "./playground/generate-screen.js";
import { registerPreviewAppResource } from "./preview/app-resource.js";
import { registerKnowledgeResources, registerKnowledgeTools } from "./tools/knowledge.js";
import { registerReferenceTools } from "./tools/references.js";
import { registerPrompts } from "./prompts.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerScreenTools } from "./tools/screens.js";
import { registerElementTools } from "./tools/elements.js";
import { registerKeyTools } from "./tools/keys.js";
import { registerAgentTools } from "./tools/agent.js";

const INSTRUCTIONS = `BranderUX turns an AI agent's answers into branded, interactive UI.

Two families of tools:
• KNOWLEDGE (no scopes needed) — get_started, read_doc, search_docs, get_integration_snippet, list_templates, get_template (the five reference builds as worked examples: read the closest MOMENT, adapt for the customer, never copy).
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
(login, access follow-up, handoff email, escalation timing, write consent; never ask about answer
quality or which AI model to use — the balanced default is right; change the stop only when
the owner asks, never naming a model, a vendor or a price), write wiring,
set_home_screen, then publish_site immediately as the last build step (don't wait to be
asked). Publishing yields the site AND an identity-free MCP endpoint at <slug>.branderux.app/mcp
(reads plus the owner's enabled add-only writes; not public when sign-in is required).
An owner's own AI-provider key is never handled in chat: never ask for, read or echo one — it goes
in ONLY through the "Your API key" card under Advanced in the Agent tab's Answer quality panel (or the in-app Builder's request_credential
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
  // The web app runs the serve network: canned-screen verification only means
  // something when the fetch is made the way serving makes it.
  const app = createAppClient(apiTokenProvider);

  registerKnowledgeTools(server);
  registerKnowledgeResources(server);
  registerReferenceTools(server);
  registerPreviewAppResource(server);
  registerPrompts(server);
  registerProjectTools(server, api);
  registerScreenTools(server, api);
  registerElementTools(server, api);
  registerKeyTools(server, api);
  registerAgentTools(server, api, app);
  await registerPlayground(server);
  registerGenerateScreen(server, api);

  return server;
}
