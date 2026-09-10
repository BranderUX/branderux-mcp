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
2. Confirm with me first: brand direction (unless given above) and which 3-5 screens matter most. Offer the playground (generate_screen) if I want to see BranderUX output before building.
3. whoami, then create_project.
4. update_brand_settings with a coherent palette and type; update_project_settings with customPages — 3-5 nav entries ({id, name, query}) matching the screens, so the embed has navigation. Projects serve FLEXIBLE mode by default — leave uiGenerationMode unset; write it only when the owner asks for something that needs the other mode.
5. Author 4-6 custom elements yourself (one per screen AREA, not per widget) and publish them with create_element — each renders in the panel as you publish; pause for my feedback.
6. Disable the fixed elements that don't fit this product (update_project_settings elementVisibility, kebab keys like "data-table": false; chat-bubble is always on — a false for it is ignored) so the runtime AI composes from OUR elements — tell me which you kept and why.
7. Compose 4-6 example screens with put_screen, pinning the published element versions. Show each with generate_screen (with projectId) so I see the assembled screen in my brand.
8. Ask me for my site's exact origin(s), then create_api_key. Relay the raw key immediately — and never claim it "can't be shown again" (conversations persist; the origin allow-list is the security boundary, note it instead).
9. Give me the frontend snippet and the backend agent route (get_integration_snippet), with params.system forwarded.
10. Finish with the exact env block to paste: BRANDER_PROJECT_ID=… and BRANDER_API_KEY=… (plus where each goes in the snippet).
Ask me before anything destructive.`,
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "build-hosted-agent-app",
    {
      title: "Build a hosted agentic app (business without its own AI)",
      description:
        "End-to-end HOSTED build: a BranderUX-hosted agent answers from managed entities, with working visitor writes, owner escalation email, a designed home, and an immediate publish to <slug>.branderux.app.",
      argsSchema: {
        business: z.string().describe("The business, e.g. 'a flower shop in Ashdod' or a URL"),
        brandNotes: z.string().optional().describe("Brand direction: colors, tone, typography"),
      },
    },
    ({ business, brandNotes }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Build a BranderUX-HOSTED agentic app for: ${business}.
${brandNotes ? `Brand direction: ${brandNotes}\n` : ""}
This business has no AI of its own — the BranderUX-hosted agent answers. Follow THE HOSTED BUILD ARC exactly:
1. read_doc "hosted-agent-contract" FIRST (also "custom-elements-contract" and "screens-wire-format" before authoring).
2. Ask me the FIVE MANDATORY QUESTIONS from the contract (login requirement, access follow-up, handoff email — never my account email, escalation timing, write-tool consent) and WAIT for my answers.
3. whoami → create_project → brand.
4. define_entity for the real data shapes — writable entities (bookings/orders/enquiries) get the right writePolicy per the coherence rule and are end-user-scoped, never public-read. On an EXISTING project run list_entities first and re-define any intake entity that is public-read as end-user-scoped (same jsonSchema) before anything else. Then seed_records (marked _demo) or wire live sources.
5. upsert_agent_config: persona in the business's voice encoding my escalation-timing answer; policies from my answers (handoff email = the address I typed, it activates escalate_to_owner — real owner email) plus policies.language and policies.timezone (always) and policies.entityLabels for a non-English site; upsert_skill for real domain knowledge. Never ask me about answer quality or which AI model to use — the balanced default is right; change the stop (upsert_agent_config level 1-5) only if I explicitly ask for faster, cheaper or smarter answers, and never name a model, a vendor or a price. If I bring up using my own AI provider key: never ask for it, read it, repeat it or put it in this conversation — send me to the "Your API key" card under Advanced in the Agent tab's Answer quality panel (or, when you are the in-app Builder, open its secure field with request_credential named model-<provider>), and if I paste a key here tell me to remove it and use the card.
6. Author the custom elements — every submit element's clickQueryTemplate carries EVERY field its create_<entity> write needs (MAKING A WRITE ACTUALLY WORK).
7. put_screen the screens, update_project_settings customPages, then set_home_screen (required).
8. list_entities to VERIFY writePolicy round-tripped, then publish_site IMMEDIATELY — derive the slug from the business name, announce the live URL, remind me writes/sign-in/emails run there.
Talk to me as a business owner, not an engineer: no jargon and no tool, field, config or version names, and never paste raw JSON or tool output — describe every result as a business outcome ("your order form now saves requests", not "the entity's writePolicy is open"). The ONE exception is consent and safety: the write-tool consent question in step 2 keeps its exact tool names and verbatim warnings.
The moment the publish succeeds, wrap up in plain words: my live site address, the fact that AI assistants (Claude, ChatGPT and any MCP client) can now look up my business at that same address with /mcp on the end and answer about it in my brand — give me that link too, nothing extra to set up — that when my build enabled writes (an open entity whose create tool is not switched off, or a handoff email) assistants can also place requests, orders or bookings there after asking the person for approval, otherwise it only answers questions — that the address is public only when my site does not require sign-in — and two or three things to try first (questions, plus one booking or order example only when writes are enabled).
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
