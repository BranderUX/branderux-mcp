# A2UI wire format (flexible mode)

In flexible mode `params.system` teaches the customer's model to emit screens as
JSONL between markers, inside ordinary streamed text:

```
One short sentence of plain text (optional).
---A2UI_START---
{"createSurface":{"surfaceId":"main","catalogId":"brander"}}
{"updateComponents":{"surfaceId":"main","components":[
  {"id":"root","component":"Column","children":["title","grid"],"spacing":3},
  {"id":"title","component":"HEADER","text":{"path":"/title/text"}},
  {"id":"grid","component":"custom:my-product-grid","products":{"path":"/grid/products"}}
]}}
{"updateDataModel":{"surfaceId":"main","path":"/title","value":{"text":"New arrivals"}}}
{"updateDataModel":{"surfaceId":"main","path":"/grid","value":{"products":[...]}}}
---A2UI_END---
Optional closing text (renders under the screen).
```

Facts an integrator (or a canned-response generator) must know:
- The component tree is a FLAT adjacency list; the root id is `"root"`; containers are
  `Column`/`Row` with `children` id arrays and optional `spacing`/`weight`.
- Props bind by PATH into the data model: `{"prop": {"path": "/<componentId>/<prop>"}}`,
  then one `updateDataModel` per component supplies values.
- Custom elements are addressed as `custom:<element-key>`.
- EXACTLY ONE A2UI block per response. Text before the markers renders as the assistant
  bubble; text after renders as the closing note.
- Deterministic intents can skip the LLM entirely: the customer's endpoint can return a
  pre-built A2UI block as canned SSE for known queries (instant, zero tokens) — the
  Atelier Nova home screen works this way.
