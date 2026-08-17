/**
 * Verified integration snippets. Two rules govern this file:
 *  1. Every snippet forwards `params.system` and optional-chains `params.tools` —
 *     the two omissions that silently break integrations.
 *  2. We never invent third-party APIs. For agent frameworks we show the BranderUX
 *     side of the boundary (which we own and can guarantee) and point at the
 *     framework's own AG-UI adapter for the other side.
 */

export const SNIPPETS = {
  "action-handlers": `// Deterministic actions (SDK 0.5.0+): a registered action runs YOUR handler in
// YOUR app (your session, your API clients) INSTEAD of becoming an AI query.
// KEYS: the EXACT action names from list_elements → actions[].name — copy them
// verbatim, never guess. Unregistered actions keep click-to-query behavior.
// COLLISIONS: a bare key is a CATCH-ALL — the same name on several elements
// fires ONE handler for all of them (payload.elementKey says which fired). To
// target a single element use its actions[].scopedKey ("custom:<key>.onAction",
// SDK 0.5.1+) — a scoped match wins over the bare name.
// WHICH actions to register: usually MUTATIONS only (add-to-cart, order,
// subscribe). Leave select/view PRIMARIES unregistered so item navigation
// stays conversational — a bare primary key hijacks navigation on EVERY
// element sharing the name; if one element's primary must be handled,
// register it SCOPED.
// RULES: handler errors are logged, never retried, never routed to the AI —
// surface them in your own UI. Treat the payload as untrusted input (validate
// like a public endpoint). If an action's meaning or item fields are ambiguous
// after reading actions[].meaning/itemShape/exampleItem, ASK the user which API
// call it maps to — never invent an endpoint.
<Brander
  apiKey="bux_pk_your_key"
  projectId="your_project_id"
  onQueryStream={(params) => sseStream("/api/agent", { params })}
  actionHandlers={{
    // item matches actions[].exampleItem for this element
    onAddToCart: async ({ item }) => {
      await myApi.cart.add(item.id);
      showToast(\`Added \${item.title}\`);
      // Optional: run a normal query afterwards (appears as a USER message)
      return { followUpQuery: "Show my cart" };
    },
    onSubscribe: async ({ item }) => {
      await myApi.newsletter.subscribe(item.id); // pure side-effect: no return
    },
    // Scoped (actions[].scopedKey): ONLY this element's onSelect — other
    // elements' onSelect keeps click-to-query behavior
    "custom:product-grid.onSelect": async ({ item }) => {
      await myApi.cart.add(item.id);
    },
  }}
/>`,
  anthropic: `import Brander, { anthropicStream } from "@brander/sdk";
import Anthropic from "@anthropic-ai/sdk";

// Server-side only — never expose provider keys in the browser.
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

<Brander
  apiKey="bux_pk_your_key"
  projectId="your_project_id"
  onQueryStream={async function* (params) {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-5",
      max_tokens: params.max_tokens || 4000,
      // Your persona + BranderUX UI instructions — append, never replace. REQUIRED
      system: YOUR_SYSTEM_PROMPT + "\\n\\n" + params.system,
      messages: params.messages,
      tools: params.tools?.anthropic, // optional: absent in flexible mode
    });
    yield* anthropicStream(stream);
  }}
/>`,

  openai: `import Brander, { openaiStream } from "@brander/sdk";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

<Brander
  apiKey="bux_pk_your_key"
  projectId="your_project_id"
  onQueryStream={async function* (params) {
    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        // Your persona + BranderUX UI instructions — append, never replace. REQUIRED
        { role: "system", content: YOUR_SYSTEM_PROMPT + "\\n\\n" + params.system },
        ...params.messages,
      ],
      tools: params.tools?.openai,
      stream: true,
    });
    yield* openaiStream(stream);
  }}
/>`,

  gemini: `import Brander, { geminiStream } from "@brander/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

<Brander
  apiKey="bux_pk_your_key"
  projectId="your_project_id"
  onQueryStream={async function* (params) {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      // Your persona + BranderUX UI instructions — append, never replace. REQUIRED
      systemInstruction: YOUR_SYSTEM_PROMPT + "\\n\\n" + params.system,
      tools: params.tools?.gemini
        ? [{ functionDeclarations: params.tools.gemini }]
        : undefined,
    });
    const result = await model.generateContentStream({
      contents: params.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
    });
    yield* geminiStream(result.stream);
  }}
/>`,

  "sse-backend": `// ---------- Frontend ----------
import Brander, { sseStream } from "@brander/sdk";

<Brander
  apiKey="bux_pk_your_key"
  projectId="your_project_id"
  onQueryStream={(params) => sseStream("/api/agent", { params })}
/>

// ---------- Backend (Node/Express) ----------
// sseStream POSTs { params } — the payload is NESTED under "params".
app.post("/api/agent", async (req, res) => {
  const { system, messages, tools, max_tokens } = req.body.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  const send = (event) => res.write(\`data: \${JSON.stringify(event)}\\n\\n\`);

  const runId = \`run-\${Date.now()}\`;
  send({ type: "RUN_STARTED", runId, timestamp: Date.now() });

  // ... call YOUR agent with system + messages, emitting:
  //   TEXT_MESSAGE_START / TEXT_MESSAGE_CONTENT (delta) / TEXT_MESSAGE_END
  //   TOOL_CALL_START / TOOL_CALL_ARGS (delta) / TOOL_CALL_END

  send({ type: "RUN_FINISHED", runId, timestamp: Date.now() }); // REQUIRED to close the run
  res.write("data: [DONE]\\n\\n");
  res.end();
});`,

  python: `# ---------- Backend (FastAPI) ----------
# sseStream POSTs {"params": {...}} — read the NESTED object.
@app.post("/api/agent")
async def agent(request: dict):
    params = request.get("params", {})
    system = params.get("system", "")        # BranderUX UI instructions — REQUIRED
    messages = params.get("messages", [])
    tools = (params.get("tools") or {}).get("anthropic", [])

    async def stream():
        run_id = f"run-{int(time.time() * 1000)}"
        yield f"data: {json.dumps({'type': 'RUN_STARTED', 'runId': run_id})}\\n\\n"

        # ... run YOUR agent with system + messages, emitting AG-UI events:
        #     TEXT_MESSAGE_START / TEXT_MESSAGE_CONTENT / TEXT_MESSAGE_END
        #     TOOL_CALL_START / TOOL_CALL_ARGS / TOOL_CALL_END

        yield f"data: {json.dumps({'type': 'RUN_FINISHED', 'runId': run_id})}\\n\\n"
        yield "data: [DONE]\\n\\n"

    return StreamingResponse(stream(), media_type="text/event-stream")`,

  "agent-framework": `// Connecting an EXISTING agent framework (LangGraph, CrewAI, Mastra, Pydantic AI,
// Google ADK, AWS Strands, LlamaIndex, Agno, AG2, Microsoft Agent Framework…).
//
// BranderUX speaks AG-UI, and these frameworks ship their own AG-UI adapters, so the
// integration is a translation at ONE boundary: BranderUX params in, AG-UI events out.
//
// Step 1 — frontend is identical for every framework:
import Brander, { sseStream } from "@brander/sdk";
<Brander
  apiKey="bux_pk_your_key"
  projectId="your_project_id"
  onQueryStream={(params) => sseStream("/api/agent", { params })}
/>

// Step 2 — backend: unwrap OUR envelope, hand it to YOUR agent, stream AG-UI back.
//
//   req.body.params = { system, messages, tools?, max_tokens }
//
//   a) Merge params.system into the agent's system prompt/instructions. This is the
//      only BranderUX-specific step and the one everybody forgets — without it the
//      agent never emits UI.
//   b) Run the agent with params.messages as the conversation.
//   c) Emit AG-UI events. If your framework has an AG-UI adapter/endpoint, point it
//      at this route and let it do the encoding; otherwise emit the events yourself
//      (see the "sse-backend" snippet for the exact frames).
//
// Pseudocode, framework-agnostic:
app.post("/api/agent", async (req, res) => {
  const { system, messages } = req.body.params;

  const agent = buildYourAgent({
    // however your framework spells "system prompt":
    instructions: \`\${YOUR_DOMAIN_PROMPT}\\n\\n\${system}\`,
  });

  res.setHeader("Content-Type", "text/event-stream");
  const send = (event) => res.write(\`data: \${JSON.stringify(event)}\\n\\n\`);
  const runId = \`run-\${Date.now()}\`;
  send({ type: "RUN_STARTED", runId, timestamp: Date.now() });

  const messageId = \`msg-\${Date.now()}\`;
  send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant", timestamp: Date.now() });
  for await (const chunk of agent.stream({ messages })) {
    send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: chunk.text, timestamp: Date.now() });
  }
  send({ type: "TEXT_MESSAGE_END", messageId, timestamp: Date.now() });

  send({ type: "RUN_FINISHED", runId, timestamp: Date.now() });
  res.write("data: [DONE]\\n\\n");
  res.end();
});

// NOTE on AG-UI adapters: frameworks that expose an AG-UI endpoint expect AG-UI's own
// RunAgentInput body, while the BranderUX SDK posts { params }. Put your route in
// between: read req.body.params, call the framework, stream AG-UI events back. Do not
// point the SDK directly at a framework's AG-UI endpoint.`,

  "mcp-apps": `// If your product is an MCP server (an "MCP app") rather than a website, use
// @brander/mcp-tools instead of the SDK — it registers BranderUX screen tools on your
// server so the host renders branded UI inline.
import { registerBranderTools } from "@brander/mcp-tools";

registerBranderTools(server, {
  apiKey: process.env.BRANDER_API_KEY, // bux_pk_…
  projectId: process.env.BRANDER_PROJECT_ID,
});

// This is a DIFFERENT product from the BranderUX MCP you are talking to right now:
//   • BranderUX MCP (this server)  → YOU build and control BranderUX projects.
//   • @brander/mcp-tools           → YOUR MCP app renders branded screens to ITS users.`,
} as const;

export type SnippetKey = keyof typeof SNIPPETS;
