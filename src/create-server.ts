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
import { registerWhatsAppTools } from "./tools/whatsapp.js";

/**
 * The server's instructions. Claude Code shows a server's instructions up to
 * INSTRUCTIONS_WINDOW characters and cuts the rest, so everything here must fit
 * in it (test/server-instructions.test.mjs): a rule past the window never
 * reaches the model. Details belong in the docs and the tool descriptions.
 */
export const INSTRUCTIONS_WINDOW = 2048;

export const INSTRUCTIONS = `BranderUX turns an AI agent's answers into branded, interactive UI.

• KNOWLEDGE (no scopes needed) — get_started, read_doc, search_docs, get_integration_snippet,
list_templates, get_template (reference builds: adapt the closest MOMENT, never copy).
Start with get_started; read the relevant doc BEFORE writing element code or screens
(guessed wire formats fail silently).
• CONTROL — the signed-in user's projects, brand settings, custom elements, screens and API
keys. Destructive tools need confirm: true; ask the user first.
• generate_screen — renders a branded screen in the panel (with projectId: a real project's
brand + custom elements; without: the playground, only when nothing exists yet). SHOW,
don't describe.

Two audiences, don't confuse them: these tools let YOU build BranderUX projects; the
customer's own agent renders branded screens via @brander/sdk (agent-frameworks doc) or
@brander/mcp-tools if their product is an MCP server.

For a business with NO AI of its own, build a BranderUX-HOSTED agent: read
hosted-agent-contract FIRST and follow THE HOSTED BUILD ARC — mandatory owner questions
(login, access follow-up, handoff email, escalation timing, write consent; never ask about
answer quality or the AI model — the balanced default is right; change it only when the
owner asks, naming no model, vendor or price), write wiring, set_home_screen, then
publish_site immediately as the last build step (don't wait to be asked). Publishing also
yields an identity-free MCP endpoint at <slug>.branderux.app/mcp (reads + the owner's
enabled add-only writes; not public if sign-in is required).
An owner's AI-provider key stays out of chat: never ask for, read or echo one; it goes in
ONLY through the "Your API key" card under Advanced in the Agent tab's Answer quality panel
(or the in-app Builder's request_credential tool named model-<provider>).
Last, if get_whatsapp_status allows and the business's customers use WhatsApp, offer it once (read_doc whatsapp-channel); to connect it, never ask for a phone number or a token.`;

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
  // something when the fetch is made the way serving makes it. It alone also
  // knows whether it has WhatsApp for owners (get_whatsapp_status).
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
  registerWhatsAppTools(server, api, app);
  await registerPlayground(server);
  registerGenerateScreen(server, api);

  return server;
}
