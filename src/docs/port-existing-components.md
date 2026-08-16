# Porting Existing Components into BranderUX

For customers who already built their own gen-UI components. You (the agent)
run inside their repo — read their components directly and port each one into
a BranderUX custom element. The split is always the same: **the UI becomes a
BranderUX element; the behavior stays in the customer's app** (wired back via
the SDK's `actionHandlers`).

## The 7-step porting contract (per component)

1. **Read the source component** in the customer's repo. Identify: the JSX
   structure, the data it renders, and everything it DOES (fetches, mutations,
   router pushes, analytics calls).

2. **Keep the UI**: JSX structure, layout, lists/conditionals, styling intent.
   Translate styles to the authoring contract (MUI `sx`; see
   `custom-elements-contract`). The component function MUST be named
   `Component` with an `export interface Props`.

3. **Inbound data → props.** Anything the component LOADS (fetches, hooks,
   stores) becomes a prop with a `propsSchema` entry — the agent supplies the
   data at render time. Network calls inside elements are rejected at create
   time (fetch/XHR/WebSocket are validation errors).

4. **Outbound behavior → named action callbacks.** Every click that fetched,
   mutated, or navigated becomes a declared callback: `onAddToCart`,
   `onSubscribe`, `onCheckout` — on-Verb-Noun, one callback per distinct
   behavior, invoked with the SAME item object the row/card renders.

5. **Library mapping.** Only allowlisted libraries (MUI, lucide-react,
   recharts, …). Common swaps: styled-components/Tailwind classes → `sx`;
   their design-system button → MUI `Button` (brand tokens style it); axios/
   ky → REMOVED (that logic returns in step 7). Anything unmappable:
   simplify — and TELL the user what was simplified; never silently drop
   functionality.

6. **Validate by creating.** Call `create_element` — compilation + static
   validation are your feedback loop (loud, named errors). Iterate until
   green, then `preview_element` to SHOW the user the result.

7. **Record the behavior ledger.** For every callback created in step 4,
   remember the ORIGINAL code it replaced (endpoint, method, fields used).
   The ledger becomes the `actionHandlers` bodies at integration time — the
   customer's logic runs exactly where it ran before: their app.

## Wiring it back (`actionHandlers`)

At SDK integration, generate the handler map in the CUSTOMER's code — use the
`action-handlers` snippet (`get_integration_snippet`). Keys come from
`list_elements` → `actions[].name`, verbatim. Bodies come from the ledger.
Mutations that should show a new screen return `{ followUpQuery: "..." }`
(phrase it as a USER query — it appears in the conversation); pure
side-effects return nothing.

Set sensible click-query templates anyway (step 6 metadata): they are the
fallback contract for surfaces WITHOUT handlers (playground, MCP panel).

## ASK, don't guess

If an action's meaning or item shape is ambiguous after reading the
`actions[]` contract (`meaning`, `itemShape`, `exampleItem`) — e.g. the
component passes a computed object, or two arrays could be the items source —
**ask the user which API call the action maps to and which fields it needs.**
Never invent an endpoint; never assume a field exists. Handler bodies touch
the customer's real systems.
