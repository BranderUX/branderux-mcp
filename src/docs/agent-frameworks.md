# Connecting a customer-facing agent to BranderUX

This doc is about the OTHER agent: not the coding agent reading this, but the AI agent
the customer ships to *their* users. BranderUX turns that agent's answers into branded,
interactive screens. This is the integration you are being asked to build.

## The whole contract, in one boundary

```
customer's UI            BranderUX embed              customer's backend            their agent
─────────────            ───────────────              ──────────────────            ───────────
<Brander … onQueryStream={(params) => sseStream("/api/agent", { params })} />
                              │  POST { params }
                              ▼
                     { system, messages, tools?, max_tokens }  ──►  run the agent
                              ◄── SSE: AG-UI events  ────────────   stream results
```

**In:** `params.system` (all UI-generation instructions), `params.messages` (the
conversation), `params.tools` (optional; deterministic mode only), `params.max_tokens`.
**Out:** AG-UI events as SSE frames — `data: {json}\n\n` — ending with `RUN_FINISHED`.

That is the entire surface. Any agent that can (a) accept a system prompt, (b) stream
text, and (c) be wrapped in an HTTP route can integrate. Framework choice is irrelevant
to BranderUX.

## The four rules (every silent failure is one of these)

1. **Forward `params.system`.** Merge it into your agent's system prompt/instructions —
   it carries the entire screen-generation protocol. Drop it and the agent answers in
   plain text forever, with no error anywhere.
2. **`params.tools` is optional.** Always `params.tools?.anthropic`. In flexible mode
   (the default) it is absent, and unguarded access throws at runtime.
3. **The request body is nested.** `sseStream` posts `{ params: {...} }` — read
   `req.body.params`, never `req.body.messages`.
4. **Finish the run.** A stream that closes without `RUN_FINISHED` leaves the UI
   loading forever. Emit it in a `finally`.

## AG-UI event sequence

```
RUN_STARTED
  TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT (many, `delta`) → TEXT_MESSAGE_END
  TOOL_CALL_START    → TOOL_CALL_ARGS (many, `delta`)       → TOOL_CALL_END
RUN_FINISHED            (or RUN_ERROR)
```
Then `data: [DONE]`. Text deltas render as the assistant's message; in flexible mode the
screen itself arrives inside those text deltas, between `---A2UI_START---` and
`---A2UI_END---` markers (see `a2ui-wire-format`).

## Framework-by-framework

BranderUX consumes AG-UI, the same protocol these agent frameworks emit, so the work is
always "unwrap `params`, run the agent, stream AG-UI".

| Framework | Integration route |
|---|---|
| **LangGraph** | Has a first-party AG-UI integration. Wrap it in your own route: read `req.body.params`, inject `params.system` into the graph's system message, stream AG-UI out. |
| **CrewAI** | First-party AG-UI integration (flows). Same wrapper; put `params.system` in the crew/flow's system context. |
| **Mastra** | First-party AG-UI support. Merge `params.system` into the agent's `instructions`. |
| **Pydantic AI** | First-party AG-UI integration. Pass `params.system` as the agent's system prompt / instructions. |
| **Google ADK** | First-party AG-UI integration. Merge into the agent's `instruction`. |
| **AWS Strands, LlamaIndex, Agno, AG2, Microsoft Agent Framework** | All ship AG-UI integrations; identical wrapper pattern. |
| **OpenAI Agents SDK, Cloudflare Agents** | AG-UI integrations in progress at time of writing — use the generic recipe below (they stream text; you emit the events). |
| **Vercel AI SDK, n8n, Dify, homegrown** | No AG-UI adapter needed: the generic recipe is ~30 lines. |

**Important:** do NOT point `<Brander onQueryStream>` at a framework's native AG-UI
endpoint directly. Those endpoints expect AG-UI's own `RunAgentInput` body, while the
BranderUX SDK posts `{ params }`. Your route sits in between and translates. This
mismatch is the single most common integration failure.

## Generic recipe (works for every framework)

```ts
app.post("/api/agent", async (req, res) => {
  const { system, messages, max_tokens } = req.body.params;   // rule 3

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
  const runId = `run-${Date.now()}`;
  const messageId = `msg-${Date.now()}`;

  send({ type: "RUN_STARTED", runId, timestamp: Date.now() });
  try {
    const agent = buildAgent({ instructions: `${DOMAIN_PROMPT}\n\n${system}` }); // rule 1
    send({ type: "TEXT_MESSAGE_START", messageId, role: "assistant", timestamp: Date.now() });
    for await (const chunk of agent.stream({ messages })) {
      send({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: chunk.text, timestamp: Date.now() });
    }
    send({ type: "TEXT_MESSAGE_END", messageId, timestamp: Date.now() });
  } catch (error) {
    send({ type: "RUN_ERROR", message: String(error), timestamp: Date.now() });
  } finally {
    send({ type: "RUN_FINISHED", runId, timestamp: Date.now() });   // rule 4
    res.write("data: [DONE]\n\n");
    res.end();
  }
});
```

Provider SDKs (Anthropic/OpenAI/Gemini) can skip the hand-rolled events entirely — the
BranderUX SDK ships `anthropicStream`, `openaiStream` and `geminiStream` adapters that do
the translation. Ask `get_integration_snippet` for those.

## Two robustness patterns worth copying

- **Format guard.** Require a UI block in every reply, and on the server buffer the
  stream until the A2UI marker appears; if a reply arrives without one, silently retry
  once with a corrective instruction. Conversation history is stored as short text
  summaries, and models otherwise start imitating that shape and answering text-only.
- **Canned intents.** For deterministic queries (a home screen), return a pre-built A2UI
  block instead of calling the model: instant paint, zero tokens, same protocol.

## MCP apps

If the customer's product is an MCP server rather than a website, they don't need this
integration at all — `@brander/mcp-tools` registers BranderUX screen tools on their MCP
server so the host renders branded UI inline. Ask for the `mcp-apps` snippet.
