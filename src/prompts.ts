import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Prompts are user-invoked workflows (slash commands in most clients). They front-load
 * the sequencing so a user gets a correct multi-step build without knowing the tool
 * names or the order they belong in.
 */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "build-agentic-site",
    {
      title: "Build a full agentic site",
      description:
        "End-to-end: create a BranderUX project, brand it, author custom elements and screens, and produce the embed snippet for a site where every screen is generated at runtime.",
      argsSchema: {
        product: z.string().describe("What the site sells or does, e.g. 'an independent coffee roaster'"),
        brandNotes: z.string().optional().describe("Brand direction: colors, tone, typography"),
      },
    },
    ({ product, brandNotes }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Build a full agentic site on BranderUX for: ${product}.
${brandNotes ? `Brand direction: ${brandNotes}\n` : ""}
Work in this order, using the BranderUX MCP tools:
1. Call get_started, then read_doc for "custom-elements-contract" and "screens-wire-format" BEFORE writing anything.
2. whoami, then create_project.
3. update_brand_settings with a coherent palette and type; update_project_settings with {"uiGenerationMode": "flexible"}.
4. Author 4-6 custom elements yourself (one per screen AREA, not per widget) and publish them with create_element. Follow the sandbox rules in the contract exactly.
5. Compose 4-6 example screens with put_screen, pinning the published element versions.
6. create_api_key for the site's origin.
7. Give me the frontend snippet and the backend agent route (get_integration_snippet), with params.system forwarded.
Ask me before anything destructive.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "integrate-branderux",
    {
      title: "Integrate BranderUX into my agent",
      description:
        "Wire an existing customer-facing agent (any framework) to BranderUX so its answers render as branded, interactive screens.",
      argsSchema: {
        stack: z.string().describe("The app + agent stack, e.g. 'Next.js + LangGraph' or 'FastAPI + Anthropic'"),
      },
    },
    ({ stack }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Integrate BranderUX into my ${stack} app.
Read read_doc "agent-frameworks" and "sdk-integration" first, then get_integration_snippet for my stack.
Requirements you must honor: forward params.system into the agent's system prompt; optional-chain params.tools; read the request body from req.body.params; always end the stream with RUN_FINISHED.
If I have no project yet, create one and mint an API key for my origin.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "author-custom-element",
    {
      title: "Author a custom element",
      description:
        "Write, validate and publish a sandboxed BranderUX custom element for one of my projects.",
      argsSchema: {
        element: z.string().describe("What the element should do, e.g. 'a product grid with click-through'"),
        projectId: z.string().optional().describe("Target project id (ask if omitted)"),
      },
    },
    ({ element, projectId }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Author a BranderUX custom element: ${element}.
${projectId ? `Project: ${projectId}\n` : "Ask me which project to add it to.\n"}
Read read_doc "custom-elements-contract" first and follow it exactly — export interface Props + export default function Component, no prop defaults, allowlisted imports only, optional-chained callbacks, onItemContextMenu for right-click, and the sandbox rules (popovers must not move focus, motion needs container room, view swaps keep one height, breakpoints are iframe-relative).
Then publish it with create_element, including a skeleton and realistic defaultProps.`,
          },
        },
      ],
    })
  );
}
