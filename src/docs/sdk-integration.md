# @brander/sdk integration reference (verified)

## FIRST: which lane is this project? (get this wrong and you send people to write a backend they don't need)

- **HOSTED project** (an enabled agent config exists — the BranderUX-hosted agent answers):
  the ENTIRE integration is handler-free. NO `onQuery`/`onQueryStream`, NO backend route,
  NO relay — the SDK detects the missing handlers and runs phase 2 on BranderUX servers
  (SDK 0.6.0+). The one-liners:

  ```tsx
  import Brander from "@brander/sdk";
  <Brander apiKey="bux_pk_..." projectId="..." isFullscreen />
  ```

  or the floating chat-bubble widget:

  ```tsx
  import { BranderChatWidget } from "@brander/sdk";
  <BranderChatWidget apiKey="bux_pk_..." projectId="..." />
  ```

  Never instruct a hosted-project owner to implement `onQueryStream` or a backend route.
  The zero-code alternative is always a plain link/button to their published site.

- **EXTERNAL-AGENT product** (the customer's own AI answers): everything below applies —
  `onQueryStream` (recommended) or `onQuery` plus a backend route that talks to THEIR model.

## Install & mount (external-agent lane)

```bash
npm install @brander/sdk
```

```tsx
import Brander, { sseStream } from "@brander/sdk";

<Brander
  apiKey="bux_pk_..."        // project API key (create_api_key tool); exchanged in-browser
  projectId="..."             // project UUID
  variant="chat"              // "chat" (default) | "classic" | "hybrid"
  isFullscreen                 // full agentic-app mode: the surface IS the site
  onQueryStream={(params) => sseStream("/api/agent", { params })}
/>
```

Required: `apiKey`, `projectId`; handlers are OPTIONAL since 0.6.0 (absent = hosted mode).
For an external agent, provide ONE of `onQueryStream` (recommended) / `onQuery`.

## CustomerAIParams — what your handler receives

- `params.system` (string) — ALL BranderUX screen instructions (in flexible/A2UI mode this
  is the entire protocol). **APPEND it to the customer's own system prompt (theirs first,
  `params.system` after) — additive, never a replacement. Mandatory.**
  - Anthropic: `system: YOUR_SYSTEM_PROMPT + "\n\n" + params.system`
  - OpenAI: system message `{ role: "system", content: YOUR_SYSTEM_PROMPT + "\n\n" + params.system }` before the conversation
  - Gemini: `systemInstruction: YOUR_SYSTEM_PROMPT + "\n\n" + params.system`
- `params.messages` — the conversation only.
- `params.tools` — OPTIONAL multi-provider tool defs (deterministic mode only). Always
  optional-chain: `params.tools?.anthropic`. Gemini needs the wrapper:
  `[{ functionDeclarations: params.tools.gemini }]`.
- `params.max_tokens` — pass through (default 4000 is sensible).

## The wire protocol (custom backends)

`sseStream(url, { params })` POSTs `{ "params": CustomerAIParams }` — the payload is
NESTED under `params`. Respond as SSE: `data: <AG-UI event JSON>\n\n` per event.
Event types: RUN_STARTED, TEXT_MESSAGE_START/CONTENT/END, TOOL_CALL_START/ARGS/END,
RUN_FINISHED, RUN_ERROR. **A run only completes on RUN_FINISHED** — a stream that ends
without it leaves the UI in a loading state. End with `data: [DONE]`.

Provider adapters (`anthropicStream`, `openaiStream`, `geminiStream`) do the event
translation for you when you call providers directly from the handler.

## Flexible (A2UI) vs deterministic mode

- **Flexible (default)** — `params.system` teaches the model to emit declarative screens
  inside `---A2UI_START---` / `---A2UI_END---` markers in ordinary text deltas. No tools.
- **Deterministic** — screen selection happens first; `params.tools` carries screen tools
  named `generate_{screenId}_data`; the model answers via tool calls.
Flexible is the default (unset `uiGenerationMode` serves flexible); set `update_project_settings {"uiGenerationMode": "deterministic"}` only when the project explicitly wants tool-based screens.

## Hand-off checklist (end every integration with this)

Give the user a copy-paste env block and say where each value goes:

```bash
BRANDER_PROJECT_ID=<project uuid>     # <Brander projectId={...}>
BRANDER_API_KEY=<bux_pk_...>          # <Brander apiKey={...}> — publishable, browser-safe
ANTHROPIC_API_KEY=<sk-ant-...>        # server route ONLY — never NEXT_PUBLIC_*
```

The pk key is origin-locked to the domains given at create_api_key — remind the user to
re-run set_key_origins when their domain changes.

## Timeouts and limits

- Streaming responses have a 120s budget end-to-end; non-streaming 30s.
- Never put provider API keys in browser code (`NEXT_PUBLIC_*` leaks them) — call
  providers from a server route.
